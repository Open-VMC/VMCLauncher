use crate::error::AppError;
use crate::models::*;
use crate::services::downloads;
use crate::services::java_runtime::JavaRuntimeManager;
use crate::services::storage::{slugify, LauncherStateStore, PersistedServerRecord};
use crate::AppState;
use reqwest::Client;
use std::collections::HashMap;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex, atomic::{AtomicBool, Ordering}};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;
use sysinfo;

const MAX_CONSOLE_LINES: usize = 500;
const STATS_POLL_INTERVAL_SECS: u64 = 1;
const STORAGE_POLL_INTERVAL_SECS: u64 = 30;

pub struct RuntimeState {
    pub child: Option<Child>,
    pub stdin_tx: tokio::sync::mpsc::Sender<String>,
    pub console_lines: Arc<TokioMutex<Vec<ConsoleLine>>>,
    pub stats: Arc<TokioMutex<ServerStats>>,
    pub runtime_status: Arc<StdMutex<ServerStatus>>,
    pub started_at: Instant,
    pub pid: Option<u32>,
    pub java_upgrade_needed: Arc<StdMutex<Option<u32>>>,
    pub stop_requested: Arc<AtomicBool>,
    poll_abort: tokio::sync::watch::Sender<bool>,
}

pub struct ServerManager {
    pub runtimes: HashMap<String, RuntimeState>,
    pub http: Client,
}

impl ServerManager {
    pub fn new(http: Client) -> Self {
        Self {
            runtimes: HashMap::new(),
            http,
        }
    }

    pub async fn create_server(
        &self,
        store: &mut LauncherStateStore,
        java: &mut JavaRuntimeManager,
        payload: CreateServerPayload,
    ) -> Result<ServerRecord, AppError> {
        let uuid = Uuid::new_v4().to_string();
        let slug = slugify(&payload.display_name);
        let server_dir = store.paths.servers_dir.join(&slug);
        tokio::fs::create_dir_all(&server_dir).await?;

        let (paper_port, _port_guard) = bind_available_port(25565)?;
        let is_pumpkin = payload.kind == ServerKind::Pumpkin;

        let (java_version, resolved_version) = if is_pumpkin {
            let tag = downloads::check_pumpkin_latest_tag(&self.http).await?;
            let artifact = downloads::resolve_pumpkin_artifact(&self.http).await?;
            let bin_dest = server_dir.join(&artifact.file_name);
            downloads::download_file(&self.http, &artifact.url, &bin_dest).await?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = tokio::fs::metadata(&bin_dest).await?.permissions();
                perms.set_mode(0o755);
                tokio::fs::set_permissions(&bin_dest, perms).await?;
            }

            (0, tag)
        } else {
            let java_bin = java.ensure_java(&self.http).await?;

            let artifact = downloads::resolve_paper_artifact(&self.http, &payload.version).await?;
            let jar_dest = server_dir.join("server.jar");
            downloads::download_file(&self.http, &artifact.url, &jar_dest).await?;

            generate_server_properties(&server_dir, &ServerSettings::default(), paper_port, true).await?;
            generate_eula(&server_dir).await?;

            let java_link = server_dir.join(".java_path");
            tokio::fs::write(&java_link, java_bin.to_string_lossy().as_bytes()).await?;

            (21, payload.version.clone())
        };

        let now = chrono::Utc::now().to_rfc3339();
        let record = ServerRecord {
            server_uuid: uuid,
            display_name: payload.display_name,
            slug: slug.clone(),
            kind: payload.kind,
            version: resolved_version,
            memory_mb: payload.memory_mb,
            cpu_cores: payload.cpu_cores,
            java_version,
            status: ServerStatus::Stopped,
            created_at: now.clone(),
            updated_at: now,
            last_played_at: None,
            root_dir: server_dir.to_string_lossy().to_string(),
            settings: ServerSettings::default(),
            vmc: VmcSettings::default(),
            auto_update: true,
        };

        let persisted = PersistedServerRecord {
            record: record.clone(),
            paper_port,
            velocity_port: None,
        };
        store.add_server(persisted)?;

        Ok(record)
    }

    pub async fn delete_server(
        &mut self,
        store: &mut LauncherStateStore,
        uuid: &str,
    ) -> Result<(), AppError> {
        if let Some(mut runtime) = self.runtimes.remove(uuid) {
            let _ = runtime.poll_abort.send(true);
            if let Some(mut child) = runtime.child.take() {
                let _ = child.kill().await;
            }
        }

        let server = store
            .find_server(uuid)
            .ok_or_else(|| AppError::NotFound(format!("Server {uuid}")))?;
        let dir = PathBuf::from(&server.record.root_dir);

        store.remove_server(uuid)?;

        if dir.exists() {
            tokio::fs::remove_dir_all(&dir).await?;
        }
        Ok(())
    }

    pub async fn rename_server(
        &self,
        store: &mut LauncherStateStore,
        uuid: &str,
        new_name: String,
    ) -> Result<ServerRecord, AppError> {
        let server = store
            .find_server_mut(uuid)
            .ok_or_else(|| AppError::NotFound(format!("Server {uuid}")))?;
        server.record.display_name = new_name;
        server.record.updated_at = chrono::Utc::now().to_rfc3339();
        let record = server.record.clone();
        store.update_and_save()?;
        Ok(record)
    }

    pub async fn start_server(
        &mut self,
        store: &mut LauncherStateStore,
        app_handle: AppHandle,
        uuid: &str,
    ) -> Result<(), AppError> {
        let server = store
            .find_server_mut(uuid)
            .ok_or_else(|| AppError::NotFound(format!("Server {uuid}")))?;

        let server_dir = PathBuf::from(&server.record.root_dir);
        let memory_mb = server.record.memory_mb;
        let is_pumpkin = server.record.kind == ServerKind::Pumpkin;
        let auto_update = server.record.auto_update;
        let current_version = server.record.version.clone();

        if is_pumpkin && auto_update {
            if let Ok(latest_tag) = downloads::check_pumpkin_latest_tag(&self.http).await {
                if current_version != latest_tag {
                    if let Ok(artifact) = downloads::resolve_pumpkin_artifact(&self.http).await {
                        let bin_dest = server_dir.join(&artifact.file_name);
                        if bin_dest.exists() {
                            let _ = tokio::fs::remove_file(&bin_dest).await;
                        }
                        if downloads::download_file(&self.http, &artifact.url, &bin_dest).await.is_ok() {
                            #[cfg(unix)]
                            {
                                use std::os::unix::fs::PermissionsExt;
                                if let Ok(meta) = tokio::fs::metadata(&bin_dest).await {
                                    let mut perms = meta.permissions();
                                    perms.set_mode(0o755);
                                    let _ = tokio::fs::set_permissions(&bin_dest, perms).await;
                                }
                            }
                            server.record.version = latest_tag;
                            server.record.updated_at = chrono::Utc::now().to_rfc3339();
                        }
                    }
                }
            }
        }

        // Re-bind the port just before spawning to close the TOCTOU window between
        // create_server (where the port was first chosen) and now.
        // _port_guard is dropped at the end of this block, just before spawn.
        if !is_pumpkin {
            let stored_port = server.paper_port;
            let (live_port, _port_guard) = match TcpListener::bind(("127.0.0.1", stored_port)) {
                Ok(l) => (stored_port, l),
                Err(_) => bind_available_port(stored_port + 1)?,
            };
            if live_port != stored_port {
                patch_server_property(
                    &server_dir.join("server.properties"),
                    "server-port",
                    &live_port.to_string(),
                ).await?;
                server.paper_port = live_port;
                // The updated port is persisted by the store.update_and_save() below.
            }
        }

        // Kill orphan process left by a hot-reload or unclean crash
        let pid_file = server_dir.join(".pid");
        if pid_file.exists() {
            if let Ok(s) = tokio::fs::read_to_string(&pid_file).await {
                if let Ok(old_pid) = s.trim().parse::<u32>() {
                    let mut sys = sysinfo::System::new();
                    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(old_pid)]), false);
                    if let Some(proc) = sys.process(sysinfo::Pid::from_u32(old_pid)) {
                        proc.kill();
                    }
                }
            }
            let _ = tokio::fs::remove_file(&pid_file).await;
        }

        let mut child = if is_pumpkin {
            let bin = find_pumpkin_binary(&server_dir)?;
            Command::new(&bin)
                .current_dir(&server_dir)
                .env("RUST_LOG", "patchbukkit=debug")
                .env("RUST_BACKTRACE", "full")
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .kill_on_drop(true)
                .spawn()?
        } else {
            // Stale session.lock from a previous crash blocks world loading
            for world in &["world", "world_nether", "world_the_end"] {
                let lock = server_dir.join(world).join("session.lock");
                if lock.exists() {
                    let _ = tokio::fs::remove_file(&lock).await;
                }
            }

            let java_path_file = server_dir.join(".java_path");
            let java_bin = if java_path_file.exists() {
                PathBuf::from(tokio::fs::read_to_string(&java_path_file).await?.trim().to_string())
            } else {
                return Err(AppError::Generic("Java path not found for server".into()));
            };

            let jar_file = find_jar_in(&server_dir)?;

            Command::new(&java_bin)
                .args([
                    &format!("-Xmx{memory_mb}M"),
                    &format!("-Xms{memory_mb}M"),
                    "-jar",
                    &jar_file.to_string_lossy(),
                    "nogui",
                ])
                .current_dir(&server_dir)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .kill_on_drop(true)
                .spawn()?
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let stdin = child.stdin.take();

        let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<String>(64);
        let (poll_abort_tx, poll_abort_rx) = tokio::sync::watch::channel(false);

        // Stdin writer task
        if let Some(mut stdin_handle) = stdin {
            tokio::spawn(async move {
                while let Some(cmd) = stdin_rx.recv().await {
                    let _ = stdin_handle.write_all(cmd.as_bytes()).await;
                    let _ = stdin_handle.write_all(b"\n").await;
                    let _ = stdin_handle.flush().await;
                }
            });
        }

        server.record.status = ServerStatus::Starting;
        server.record.last_played_at = Some(chrono::Utc::now().to_rfc3339());
        let uuid_owned = uuid.to_string();
        let cpu_cores = server.record.cpu_cores;
        let _ = server; // drop mut borrow so store can be used below
        store.update_and_save()?;

        let pid = child.id();
        let console_arc: Arc<TokioMutex<Vec<ConsoleLine>>> = Arc::new(TokioMutex::new(Vec::new()));
        let stats_arc: Arc<TokioMutex<ServerStats>> = Arc::new(TokioMutex::new(ServerStats {
            ram_limit_mb: memory_mb as f64,
            cpu_limit_percent: cpu_cores as f64 * 100.0,
            ..Default::default()
        }));
        let status_arc: Arc<StdMutex<ServerStatus>> = Arc::new(StdMutex::new(ServerStatus::Starting));
        let java_upgrade_arc: Arc<StdMutex<Option<u32>>> = Arc::new(StdMutex::new(None));
        let stop_requested_arc: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));

        let runtime = RuntimeState {
            child: Some(child),
            stdin_tx,
            console_lines: console_arc.clone(),
            stats: stats_arc.clone(),
            runtime_status: status_arc.clone(),
            started_at: Instant::now(),
            pid,
            java_upgrade_needed: java_upgrade_arc.clone(),
            stop_requested: stop_requested_arc.clone(),
            poll_abort: poll_abort_tx,
        };
        self.runtimes.insert(uuid_owned.clone(), runtime);

        // PID file lets start_server kill orphans from a previous unclean exit
        if let Some(p) = pid {
            let _ = tokio::fs::write(&pid_file, p.to_string()).await;
        }

        let uuid_for_stdout = uuid_owned.clone();
        let app_for_stdout = app_handle.clone();
        let console_for_stdout = console_arc.clone();
        let status_for_stdout = status_arc.clone();
        let dir_for_stdout = server_dir.clone();
        let java_upgrade_for_stdout = java_upgrade_arc.clone();
        let stop_requested_for_stdout = stop_requested_arc.clone();
        let is_pumpkin_for_stdout = is_pumpkin;
        if let Some(stdout) = stdout {
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(raw)) = lines.next_line().await {
                    let line = strip_ansi(&raw);
                    let is_ready = if is_pumpkin_for_stdout {
                        line.contains("Server is now running")
                    } else {
                        line.contains("For help, type")
                    };
                    if is_ready {
                        *status_for_stdout.lock().unwrap() = ServerStatus::Running;
                        let _ = app_for_stdout.emit("launcher:event", LauncherEvent {
                            event_type: "server-updated".to_string(),
                            server_uuid: Some(uuid_for_stdout.clone()),
                            progress: None,
                            console_line: None,
                        });
                    }
                    if !is_pumpkin_for_stdout {
                        if let Some(java_ver) = parse_class_file_version(&line) {
                            *java_upgrade_for_stdout.lock().unwrap() = Some(java_ver);
                        }
                    }
                    let cl = ConsoleLine {
                        id: Uuid::new_v4().to_string(),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        level: classify_line(&line),
                        text: line,
                    };
                    {
                        let mut v = console_for_stdout.lock().await;
                        v.push(cl.clone());
                        if v.len() > MAX_CONSOLE_LINES { let excess = v.len() - MAX_CONSOLE_LINES; v.drain(..excess); }
                    }
                    let _ = app_for_stdout.emit("launcher:event", LauncherEvent {
                        event_type: "console-line".to_string(),
                        server_uuid: Some(uuid_for_stdout.clone()),
                        progress: None,
                        console_line: Some(cl),
                    });
                }

                let required_java = java_upgrade_for_stdout.lock().unwrap().take();
                let state = app_for_stdout.state::<AppState>();
                // Only do cleanup here on natural exit / crash.
                // If stop_server initiated the shutdown, its own task handles cleanup to
                // avoid double-remove and duplicate server-updated events.
                if !stop_requested_for_stdout.load(Ordering::Relaxed) {
                    {
                        let mut servers = state.servers.lock().await;
                        servers.runtimes.remove(&uuid_for_stdout);
                    }
                    {
                        let mut store = state.store.lock().await;
                        if let Some(s) = store.find_server_mut(&uuid_for_stdout) {
                            s.record.status = ServerStatus::Stopped;
                            let _ = store.update_and_save();
                        }
                    }
                    let _ = tokio::fs::remove_file(dir_for_stdout.join(".pid")).await;
                    let _ = app_for_stdout.emit("launcher:event", LauncherEvent {
                        event_type: "server-updated".to_string(),
                        server_uuid: Some(uuid_for_stdout.clone()),
                        progress: None,
                        console_line: None,
                    });
                }

                // Detect JVM fatal crash file written by HotSpot
                if let Ok(mut rd) = tokio::fs::read_dir(&dir_for_stdout).await {
                    while let Ok(Some(entry)) = rd.next_entry().await {
                        let name = entry.file_name();
                        let n = name.to_string_lossy();
                        if n.starts_with("hs_err_pid") && n.ends_with(".log") {
                            let path = entry.path();
                            let emit_cl = |text: String| LauncherEvent {
                                event_type: "console-line".to_string(),
                                server_uuid: Some(uuid_for_stdout.clone()),
                                progress: None,
                                console_line: Some(ConsoleLine {
                                    id: Uuid::new_v4().to_string(),
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    level: ConsoleLevel::Error,
                                    text,
                                }),
                            };
                            let _ = app_for_stdout.emit("launcher:event", emit_cl(
                                format!("[VMC Launcher] JVM crash file: {}", path.display()),
                            ));
                            if let Ok(content) = tokio::fs::read_to_string(&path).await {
                                for line in content.lines().take(50) {
                                    if !line.trim().is_empty() {
                                        let _ = app_for_stdout.emit("launcher:event", emit_cl(line.to_string()));
                                    }
                                }
                            }
                        }
                    }
                }

                if let Some(java_ver) = required_java {
                    let make_cl = |text: String, level: ConsoleLevel| LauncherEvent {
                        event_type: "console-line".to_string(),
                        server_uuid: Some(uuid_for_stdout.clone()),
                        progress: None,
                        console_line: Some(ConsoleLine {
                            id: Uuid::new_v4().to_string(),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            level,
                            text,
                        }),
                    };

                    let _ = app_for_stdout.emit("launcher:event", make_cl(
                        format!("[VMC Launcher] Java {java_ver} required: downloading..."),
                        ConsoleLevel::Warn,
                    ));

                    let http = {
                        let servers = state.servers.lock().await;
                        servers.http.clone()
                    };

                    let bin_result = {
                        let java_mgr = state.java.lock().await;
                        java_mgr.ensure_java_version(&http, java_ver).await
                    };

                    match bin_result {
                        Ok(bin) => {
                            let _ = tokio::fs::write(
                                dir_for_stdout.join(".java_path"),
                                bin.to_string_lossy().as_bytes(),
                            ).await;
                            {
                                let mut store = state.store.lock().await;
                                if let Some(s) = store.find_server_mut(&uuid_for_stdout) {
                                    s.record.java_version = java_ver;
                                    let _ = store.update_and_save();
                                }
                            }
                            let _ = app_for_stdout.emit("launcher:event", make_cl(
                                format!("[VMC Launcher] Java {java_ver} installed: restarting server..."),
                                ConsoleLevel::Info,
                            ));
                            // start_server is not Send, so the frontend restarts via event
                            let _ = app_for_stdout.emit("launcher:event", LauncherEvent {
                                event_type: "java-upgraded".to_string(),
                                server_uuid: Some(uuid_for_stdout.clone()),
                                progress: None,
                                console_line: None,
                            });
                        }
                        Err(e) => {
                            let _ = app_for_stdout.emit("launcher:event", make_cl(
                                format!("[VMC Launcher] Failed to download Java {java_ver}: {e}"),
                                ConsoleLevel::Error,
                            ));
                        }
                    }
                }
            });
        }

        // Stderr task
        let uuid_for_stderr = uuid_owned.clone();
        let app_for_stderr = app_handle.clone();
        let console_for_stderr = console_arc.clone();
        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(raw)) = lines.next_line().await {
                    let line = strip_ansi(&raw);
                    let cl = ConsoleLine {
                        id: Uuid::new_v4().to_string(),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        level: classify_line(&line),
                        text: line,
                    };
                    {
                        let mut v = console_for_stderr.lock().await;
                        v.push(cl.clone());
                        if v.len() > MAX_CONSOLE_LINES { let excess = v.len() - MAX_CONSOLE_LINES; v.drain(..excess); }
                    }
                    let _ = app_for_stderr.emit("launcher:event", LauncherEvent {
                        event_type: "console-line".to_string(),
                        server_uuid: Some(uuid_for_stderr.clone()),
                        progress: None,
                        console_line: Some(cl),
                    });
                }
            });
        }

        let app_for_stats = app_handle;
        let stats_for_task = stats_arc.clone();
        tokio::spawn(async move {
            let mut poll_abort_rx = poll_abort_rx;
            let mut storage_counter: u64 = 0;
            let mut sys = sysinfo::System::new();

            loop {
                tokio::select! {
                    _ = poll_abort_rx.changed() => break,
                    _ = tokio::time::sleep(std::time::Duration::from_secs(STATS_POLL_INTERVAL_SECS)) => {}
                }
                if *poll_abort_rx.borrow() { break; }

                // CPU + RAM via sysinfo
                let (cpu_pct, ram_mb) = if let Some(p) = pid {
                    let sysinfo_pid = sysinfo::Pid::from_u32(p);
                    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo_pid]), true);
                    if let Some(proc) = sys.process(sysinfo_pid) {
                        (proc.cpu_usage() as f64, proc.memory() as f64 / (1024.0 * 1024.0))
                    } else {
                        (0.0, 0.0)
                    }
                } else {
                    (0.0, 0.0)
                };

                // Storage (toutes les 30 secondes)
                storage_counter += STATS_POLL_INTERVAL_SECS;
                let storage_mb = if storage_counter >= STORAGE_POLL_INTERVAL_SECS {
                    storage_counter = 0;
                    calc_dir_size(&server_dir).await
                } else {
                    stats_for_task.lock().await.storage_mb
                };

                {
                    let mut s = stats_for_task.lock().await;
                    s.cpu_percent = cpu_pct;
                    s.ram_used_mb = ram_mb;
                    s.storage_mb = storage_mb;
                }

                let _ = app_for_stats.emit("launcher:event", LauncherEvent {
                    event_type: "server-updated".to_string(),
                    server_uuid: Some(uuid_owned.clone()),
                    progress: None,
                    console_line: None,
                });
            }
        });

        Ok(())
    }

    pub async fn stop_server(&mut self, uuid: &str, app_handle: AppHandle) -> Result<(), AppError> {
        let runtime = self
            .runtimes
            .get_mut(uuid)
            .ok_or_else(|| AppError::NotFound(format!("Running server {uuid}")))?;

        *runtime.runtime_status.lock().unwrap() = ServerStatus::Stopping;
        runtime.stop_requested.store(true, Ordering::Relaxed);
        let _ = runtime.stdin_tx.send("stop".to_string()).await;
        let _ = runtime.poll_abort.send(true);

        let mut child = runtime.child.take()
            .ok_or_else(|| AppError::Generic("Server is already stopping".into()))?;

        let _ = app_handle.emit("launcher:event", LauncherEvent {
            event_type: "server-updated".to_string(),
            server_uuid: Some(uuid.to_string()),
            progress: None,
            console_line: None,
        });

        let uuid_for_exit = uuid.to_string();
        let app_for_exit = app_handle;
        tokio::spawn(async move {
            let timed_out = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                child.wait(),
            ).await.is_err();
            if timed_out {
                let _ = child.kill().await;
            }

            let state = app_for_exit.state::<AppState>();
            {
                let mut servers = state.servers.lock().await;
                servers.runtimes.remove(&uuid_for_exit);
            }
            {
                let mut store = state.store.lock().await;
                if let Some(s) = store.find_server_mut(&uuid_for_exit) {
                    s.record.status = ServerStatus::Stopped;
                    let _ = s;
                    let _ = store.update_and_save();
                }
            }
            let _ = app_for_exit.emit("launcher:event", LauncherEvent {
                event_type: "server-updated".to_string(),
                server_uuid: Some(uuid_for_exit),
                progress: None,
                console_line: None,
            });
        });

        Ok(())
    }

    pub async fn send_command(&self, uuid: &str, command: String, app_handle: &AppHandle) -> Result<(), AppError> {
        let runtime = self
            .runtimes
            .get(uuid)
            .ok_or_else(|| AppError::NotFound(format!("Running server {uuid}")))?;

        let now = chrono::Utc::now();
        let time_str = now.format("%H:%M:%S").to_string();
        let cl = ConsoleLine {
            id: Uuid::new_v4().to_string(),
            timestamp: now.to_rfc3339(),
            level: ConsoleLevel::Command,
            text: format!("[{time_str} INFO]: > {command}"),
        };
        {
            let mut v = runtime.console_lines.lock().await;
            v.push(cl.clone());
            if v.len() > MAX_CONSOLE_LINES { let excess = v.len() - MAX_CONSOLE_LINES; v.drain(..excess); }
        }
        let _ = app_handle.emit("launcher:event", LauncherEvent {
            event_type: "console-line".to_string(),
            server_uuid: Some(uuid.to_string()),
            progress: None,
            console_line: Some(cl),
        });

        runtime
            .stdin_tx
            .send(command)
            .await
            .map_err(|e| AppError::Generic(e.to_string()))?;
        Ok(())
    }

    pub async fn get_console_lines(&self, uuid: &str) -> Vec<ConsoleLine> {
        match self.runtimes.get(uuid) {
            Some(r) => r.console_lines.lock().await.clone(),
            None => Vec::new(),
        }
    }

    pub async fn get_stats(&self, uuid: &str) -> ServerStats {
        match self.runtimes.get(uuid) {
            Some(r) => {
                let mut s = r.stats.lock().await.clone();
                s.uptime_seconds = r.started_at.elapsed().as_secs();
                s
            }
            None => ServerStats::default(),
        }
    }

    pub fn is_running(&self, uuid: &str) -> bool {
        self.runtimes.contains_key(uuid)
    }

    pub fn get_runtime_status(&self, uuid: &str) -> Option<ServerStatus> {
        self.runtimes.get(uuid).map(|r| r.runtime_status.lock().unwrap().clone())
    }

    pub async fn cleanup_zombies(&mut self) {
        let dead: Vec<String> = self
            .runtimes
            .iter_mut()
            .filter_map(|(k, r)| {
                let exited = r.child.as_mut()
                    .and_then(|c| c.try_wait().ok().flatten())
                    .is_some();
                if exited { Some(k.clone()) } else { None }
            })
            .collect();

        for uuid in dead {
            let _ = self.runtimes.remove(&uuid);
        }
    }
}

// File Operations

pub fn resolve_safe_path(root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    // Canonicalize root so symlinks in its path are resolved before comparison.
    let canonical_root = root.canonicalize().map_err(|_| AppError::PathTraversal)?;
    // Normalize manually: process components so `..` is resolved without requiring the
    // target file to exist (canonicalize() fails on non-existent paths).
    let joined = canonical_root.join(relative);
    let mut normalized = PathBuf::new();
    for component in joined.components() {
        match component {
            std::path::Component::ParentDir => {
                if !normalized.pop() {
                    return Err(AppError::PathTraversal);
                }
            }
            std::path::Component::CurDir => {}
            c => normalized.push(c),
        }
    }
    if !normalized.starts_with(&canonical_root) {
        return Err(AppError::PathTraversal);
    }
    Ok(normalized)
}

pub async fn list_files(root: &Path, relative: &str) -> Result<Vec<FileEntry>, AppError> {
    let dir = if relative.is_empty() || relative == "." {
        root.to_path_buf()
    } else {
        resolve_safe_path(root, relative)?
    };

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let mut read_dir = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = read_dir.next_entry().await? {
        let metadata = entry.metadata().await?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|d| {
                        chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                            .unwrap_or_default()
                            .to_rfc3339()
                    })
            })
            .unwrap_or_default();

        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry
            .path()
            .strip_prefix(root)
            .unwrap_or(&entry.path())
            .to_string_lossy()
            .to_string();

        entries.push(FileEntry {
            name,
            path,
            kind: if metadata.is_dir() {
                FileKind::Directory
            } else {
                FileKind::File
            },
            size: metadata.len(),
            modified_at: modified,
        });
    }

    entries.sort_by(|a, b| {
        let dir_order = matches!(b.kind, FileKind::Directory).cmp(&matches!(a.kind, FileKind::Directory));
        dir_order.then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

pub async fn read_file(root: &Path, relative: &str) -> Result<ServerFileContent, AppError> {
    let path = resolve_safe_path(root, relative)?;
    let content = tokio::fs::read_to_string(&path).await?;
    let metadata = tokio::fs::metadata(&path).await?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| {
                    chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                        .unwrap_or_default()
                        .to_rfc3339()
                })
        })
        .unwrap_or_default();

    Ok(ServerFileContent {
        path: relative.to_string(),
        content,
        modified_at: modified,
    })
}

pub async fn write_file(
    root: &Path,
    relative: &str,
    content: &str,
) -> Result<FileEntry, AppError> {
    let path = resolve_safe_path(root, relative)?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&path, content).await?;

    let metadata = tokio::fs::metadata(&path).await?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| {
                    chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                        .unwrap_or_default()
                        .to_rfc3339()
                })
        })
        .unwrap_or_default();

    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    Ok(FileEntry {
        name,
        path: relative.to_string(),
        kind: FileKind::File,
        size: metadata.len(),
        modified_at: modified,
    })
}

pub async fn delete_files(root: &Path, relative_paths: &[String]) -> Result<(), AppError> {
    for rel in relative_paths {
        let path = resolve_safe_path(root, rel)?;
        if path.is_dir() {
            tokio::fs::remove_dir_all(&path).await?;
        } else if path.exists() {
            tokio::fs::remove_file(&path).await?;
        }
    }
    Ok(())
}

pub async fn copy_files(
    root: &Path,
    relative_paths: &[String],
    dest_relative: &str,
) -> Result<(), AppError> {
    let dest_dir = resolve_safe_path(root, dest_relative)?;
    tokio::fs::create_dir_all(&dest_dir).await?;

    for rel in relative_paths {
        let src = resolve_safe_path(root, rel)?;
        let name = src
            .file_name()
            .ok_or_else(|| AppError::Generic("Invalid file name".into()))?;
        let target = dest_dir.join(name);
        if src.is_dir() {
            copy_dir_recursive(&src, &target).await?;
        } else {
            tokio::fs::copy(&src, &target).await?;
        }
    }
    Ok(())
}

pub async fn move_files(
    root: &Path,
    relative_paths: &[String],
    dest_relative: &str,
) -> Result<(), AppError> {
    let dest_dir = resolve_safe_path(root, dest_relative)?;
    tokio::fs::create_dir_all(&dest_dir).await?;

    for rel in relative_paths {
        let src = resolve_safe_path(root, rel)?;
        let name = src
            .file_name()
            .ok_or_else(|| AppError::Generic("Invalid file name".into()))?;
        let target = dest_dir.join(name);
        tokio::fs::rename(&src, &target).await?;
    }
    Ok(())
}

pub async fn create_directory(root: &Path, relative: &str) -> Result<(), AppError> {
    let path = resolve_safe_path(root, relative)?;
    tokio::fs::create_dir_all(&path).await?;
    Ok(())
}

async fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), AppError> {
    tokio::fs::create_dir_all(dest).await?;
    let mut entries = tokio::fs::read_dir(src).await?;
    while let Some(entry) = entries.next_entry().await? {
        let target = dest.join(entry.file_name());
        if entry.file_type().await?.is_dir() {
            Box::pin(copy_dir_recursive(&entry.path(), &target)).await?;
        } else {
            tokio::fs::copy(entry.path(), &target).await?;
        }
    }
    Ok(())
}

// Plugin listing

pub async fn list_plugins(server_dir: &Path, is_pumpkin: bool) -> Result<Vec<InstalledPlugin>, AppError> {
    let plugins_dir = server_dir.join("plugins");
    if !plugins_dir.exists() {
        return Ok(Vec::new());
    }

    let mut plugins = Vec::new();

    // For Pumpkin, scan the patchbukkit-plugins dir for JARs instead of plugins/
    let jar_dir = if is_pumpkin {
        server_dir.join("plugins").join("data").join("patchbukkit").join("patchbukkit-plugins")
    } else {
        plugins_dir.clone()
    };

    // Scan jar_dir for JAR files (or plugins_dir if not pumpkin, same thing)
    if jar_dir.exists() {
        let mut entries = tokio::fs::read_dir(&jar_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_jar = name.ends_with(".jar");
            let is_jar_disabled = name.ends_with(".jar.disabled");
            if !is_jar && !is_jar_disabled { continue; }
            if let Some(p) = build_plugin_entry(&entry, &path, &name).await { plugins.push(p); }
        }
    }

    // For Pumpkin, also scan plugins/ for WASM/native files (excluding patchbukkit itself)
    if is_pumpkin {
        let mut entries = tokio::fs::read_dir(&plugins_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_wasm = name.ends_with(".wasm");
            let is_wasm_disabled = name.ends_with(".wasm.disabled");
            let is_native = name.ends_with(".dylib") || name.ends_with(".so") || name.ends_with(".dll");
            if !is_wasm && !is_wasm_disabled && !is_native { continue; }
            let lower = name.to_lowercase();
            if lower.starts_with("patchbukkit") || lower.starts_with("libpatchbukkit") { continue; }
            if let Some(p) = build_plugin_entry(&entry, &path, &name).await { plugins.push(p); }
        }
    }

    plugins.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
    Ok(plugins)
}

async fn build_plugin_entry(entry: &tokio::fs::DirEntry, path: &Path, name: &str) -> Option<InstalledPlugin> {
    let is_jar = name.ends_with(".jar");
    let is_jar_disabled = name.ends_with(".jar.disabled");
    let is_wasm = name.ends_with(".wasm");
    let is_native_lib = name.ends_with(".dylib") || name.ends_with(".so") || name.ends_with(".dll");

    let metadata = entry.metadata().await.ok()?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| {
                    chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                        .unwrap_or_default()
                        .to_rfc3339()
                })
        })
        .unwrap_or_default();

    let display_name = name
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar")
        .trim_end_matches(".wasm")
        .trim_end_matches(".dylib")
        .trim_end_matches(".so")
        .trim_end_matches(".dll")
        .to_string();

    let enabled = is_jar || is_wasm || is_native_lib;

    let jar_meta = if is_jar || is_jar_disabled {
        extract_jar_metadata(path)
    } else {
        None
    };

    let (plugin_name, plugin_version, description, authors, website) = match jar_meta {
        Some(m) => (m.name, m.version, m.description, m.authors, m.website),
        None => (None, None, None, None, None),
    };

    let resolved_display = plugin_name.clone().unwrap_or(display_name);

    Some(InstalledPlugin {
        id: name.to_string(),
        file_name: name.to_string(),
        display_name: resolved_display,
        path: path.to_string_lossy().to_string(),
        enabled,
        size: metadata.len(),
        modified_at: modified,
        plugin_name,
        plugin_version,
        description,
        authors,
        website,
        icon_url: None,
        project_url: None,
        provider: None,
    })
}

struct JarMetadata {
    name: Option<String>,
    version: Option<String>,
    description: Option<String>,
    authors: Option<Vec<String>>,
    website: Option<String>,
}

fn extract_jar_metadata(path: &std::path::Path) -> Option<JarMetadata> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    for candidate in &["paper-plugin.yml", "plugin.yml"] {
        if let Ok(mut entry) = archive.by_name(candidate) {
            let mut content = String::new();
            std::io::Read::read_to_string(&mut entry, &mut content).ok()?;
            let yaml: serde_yaml::Value = serde_yaml::from_str(&content).ok()?;

            let name = yaml["name"].as_str().map(|s| s.to_string());
            let version = yaml["version"].as_str().map(|s| s.to_string())
                .or_else(|| yaml["version"].as_f64().map(|n| n.to_string()))
                .or_else(|| yaml["version"].as_i64().map(|n| n.to_string()));
            let description = yaml["description"].as_str().map(|s| s.to_string());
            let website = yaml["website"].as_str().map(|s| s.to_string());

            let authors = if let Some(author) = yaml["author"].as_str() {
                Some(vec![author.to_string()])
            } else if let Some(arr) = yaml["authors"].as_sequence() {
                Some(arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            } else {
                None
            };

            return Some(JarMetadata { name, version, description, authors, website });
        }
    }
    None
}

// Helpers

// Returns both the port number and the bound TcpListener so the caller can hold the port
// reserved until just before the JVM spawns, eliminating the TOCTOU window.
fn bind_available_port(start: u16) -> Result<(u16, TcpListener), AppError> {
    for port in start..=65535 {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            return Ok((port, listener));
        }
    }
    Err(AppError::Generic("No available port found".into()))
}

fn find_pumpkin_binary(dir: &Path) -> Result<PathBuf, AppError> {
    let entries = std::fs::read_dir(dir)?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("pumpkin-") && !name.ends_with(".tmp") {
            return Ok(entry.path());
        }
    }
    Err(AppError::NotFound("Pumpkin binary not found".into()))
}

fn find_jar_in(dir: &Path) -> Result<PathBuf, AppError> {
    let server_jar = dir.join("server.jar");
    if server_jar.exists() {
        return Ok(server_jar);
    }
    // Fallback pour les anciennes instances
    let entries = std::fs::read_dir(dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "jar").unwrap_or(false) {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with("paper-")
                || name.starts_with("velocity-")
                || name.starts_with("fabric-server")
                || name.starts_with("forge-")
                || name.starts_with("neoforge-")
            {
                return Ok(path);
            }
        }
    }
    Err(AppError::NotFound("Server JAR not found".into()))
}

fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' && chars.peek() == Some(&'[') {
            chars.next();
            while let Some(&next) = chars.peek() {
                chars.next();
                if next.is_ascii_alphabetic() { break; }
            }
        } else if c == '\x1b' {
            // lone ESC: skip
        } else {
            result.push(c);
        }
    }
    result
}

/// Returns the Java version required by a class file error line (class_file_version - 44).
fn parse_class_file_version(line: &str) -> Option<u32> {
    if !line.contains("UnsupportedClassVersionError") { return None; }
    let marker = "class file version ";
    let idx = line.find(marker)?;
    let rest = &line[idx + marker.len()..];
    let ver_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    let class_ver: u32 = ver_str.parse().ok()?;
    Some(class_ver.saturating_sub(44))
}

fn classify_line(line: &str) -> ConsoleLevel {
    if line.contains(" WARN ") || line.contains("[WARN]") || line.contains("WARN:") {
        ConsoleLevel::Warn
    } else if line.contains(" ERROR ") || line.contains("[ERROR]") || line.contains("ERROR:") || line.contains("SEVERE") || line.contains("panicked at") {
        ConsoleLevel::Error
    } else {
        ConsoleLevel::Info
    }
}

pub async fn patch_pumpkin_config(
    server_dir: &Path,
    field: &str,
    value: &serde_json::Value,
) -> Result<(), AppError> {
    let config_path = server_dir.join("pumpkin.toml");
    if !config_path.exists() {
        return Ok(());
    }
    let content = tokio::fs::read_to_string(&config_path).await?;
    let mut doc: toml_edit::DocumentMut = content
        .parse()
        .map_err(|e| AppError::Generic(format!("Failed to parse configuration.toml: {e}")))?;

    match field {
        "difficulty" => {
            if let Some(s) = value.as_str() {
                let capitalized = capitalize(s);
                doc["default_difficulty"] = toml_edit::value(&capitalized);
            }
        }
        "gamemode" => {
            if let Some(s) = value.as_str() {
                let capitalized = capitalize(s);
                doc["default_gamemode"] = toml_edit::value(&capitalized);
            }
        }
        "forceGamemode" => { doc["force_gamemode"] = toml_edit::value(value.as_bool().unwrap_or(false)); }
        "hardcore" => { doc["hardcore"] = toml_edit::value(value.as_bool().unwrap_or(false)); }
        "whiteList" => {
            let b = value.as_bool().unwrap_or(false);
            doc["white_list"] = toml_edit::value(b);
            doc["enforce_whitelist"] = toml_edit::value(b);
        }
        "levelSeed" => {
            if let Some(s) = value.as_str() {
                doc["seed"] = toml_edit::value(s);
            }
        }
        "pvp" => {
            if let Some(tbl) = doc.get_mut("pvp").and_then(|v| v.as_table_mut()) {
                tbl["enabled"] = toml_edit::value(value.as_bool().unwrap_or(true));
            }
        }
        "maxPlayers" => {
            if let Some(n) = value.as_u64() {
                if let Some(tbl) = doc.get_mut("networking").and_then(|v| v.as_table_mut())
                    .and_then(|t| t.get_mut("java")).and_then(|v| v.as_table_mut())
                {
                    tbl["max_players"] = toml_edit::value(n as i64);
                }
            }
        }
        "viewDistance" => {
            if let Some(n) = value.as_u64() {
                if let Some(tbl) = doc.get_mut("networking").and_then(|v| v.as_table_mut())
                    .and_then(|t| t.get_mut("java")).and_then(|v| v.as_table_mut())
                {
                    tbl["view_distance"] = toml_edit::value(n as i64);
                }
            }
        }
        "simulationDistance" => {
            if let Some(n) = value.as_u64() {
                if let Some(tbl) = doc.get_mut("networking").and_then(|v| v.as_table_mut())
                    .and_then(|t| t.get_mut("java")).and_then(|v| v.as_table_mut())
                {
                    tbl["simulation_distance"] = toml_edit::value(n as i64);
                }
            }
        }
        "motd" => {
            if let Some(s) = value.as_str() {
                if let Some(tbl) = doc.get_mut("networking").and_then(|v| v.as_table_mut())
                    .and_then(|t| t.get_mut("java")).and_then(|v| v.as_table_mut())
                {
                    tbl["motd"] = toml_edit::value(s);
                }
            }
        }
        _ => {}
    }

    tokio::fs::write(&config_path, doc.to_string()).await?;
    Ok(())
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + &c.as_str().to_lowercase(),
    }
}

pub async fn patch_server_property(path: &Path, key: &str, value: &str) -> Result<(), AppError> {
    if !path.exists() {
        return Ok(());
    }
    let content = tokio::fs::read_to_string(path).await?;
    let prefix = format!("{key}=");
    let mut found = false;
    let mut lines: Vec<String> = content
        .lines()
        .map(|line| {
            if line.starts_with(&prefix) {
                found = true;
                format!("{key}={value}")
            } else {
                line.to_string()
            }
        })
        .collect();
    if !found {
        lines.push(format!("{key}={value}"));
    }
    tokio::fs::write(path, lines.join("\n") + "\n").await?;
    Ok(())
}

pub fn camel_to_prop_key(field: &str) -> &'static str {
    match field {
        "maxPlayers" => "max-players",
        "maxTickTime" => "max-tick-time",
        "maxWorldSize" => "max-world-size",
        "spawnProtection" => "spawn-protection",
        "rateLimit" => "rate-limit",
        "viewDistance" => "view-distance",
        "simulationDistance" => "simulation-distance",
        "levelSeed" => "level-seed",
        "allowFlight" => "allow-flight",
        "whiteList" => "white-list",
        "playerIdleTimeout" => "player-idle-timeout",
        "forceGamemode" => "force-gamemode",
        _ => "",
    }
}

pub fn value_to_prop_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => s.clone(),
        _ => value.to_string(),
    }
}

pub async fn generate_server_properties(
    dir: &Path,
    settings: &ServerSettings,
    port: u16,
    online_mode: bool,
) -> Result<(), AppError> {
    let content = format!(
        "# Auto-generated by VMC Launcher\n\
         server-port={port}\n\
         difficulty={difficulty}\n\
         gamemode={gamemode}\n\
         force-gamemode={force_gamemode}\n\
         hardcore={hardcore}\n\
         max-players={max_players}\n\
         pvp={pvp}\n\
         allow-flight={allow_flight}\n\
         white-list={white_list}\n\
         enforce-whitelist={white_list}\n\
         player-idle-timeout={player_idle_timeout}\n\
         spawn-protection={spawn_protection}\n\
         view-distance={view_distance}\n\
         simulation-distance={simulation_distance}\n\
         level-seed={level_seed}\n\
         motd={motd}\n\
         online-mode={online_mode}\n\
         max-tick-time={max_tick_time}\n\
         max-world-size={max_world_size}\n\
         rate-limit={rate_limit}\n",
        difficulty = format!("{:?}", settings.difficulty).to_lowercase(),
        gamemode = format!("{:?}", settings.gamemode).to_lowercase(),
        force_gamemode = settings.force_gamemode,
        hardcore = settings.hardcore,
        max_players = settings.max_players,
        pvp = settings.pvp,
        allow_flight = settings.allow_flight,
        white_list = settings.white_list,
        player_idle_timeout = settings.player_idle_timeout,
        spawn_protection = settings.spawn_protection,
        view_distance = settings.view_distance,
        simulation_distance = settings.simulation_distance,
        level_seed = settings.level_seed,
        motd = settings.motd,
        online_mode = online_mode,
        max_tick_time = settings.max_tick_time,
        max_world_size = settings.max_world_size,
        rate_limit = settings.rate_limit,
    );
    tokio::fs::write(dir.join("server.properties"), content).await?;
    Ok(())
}

async fn generate_eula(dir: &Path) -> Result<(), AppError> {
    tokio::fs::write(dir.join("eula.txt"), "eula=true\n").await?;
    Ok(())
}

#[allow(dead_code)]
pub async fn calc_dir_size(dir: &Path) -> f64 {
    let mut total: u64 = 0;
    if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_dir() {
                total += Box::pin(calc_dir_size_inner(&path)).await;
            } else if let Ok(meta) = entry.metadata().await {
                total += meta.len();
            }
        }
    }
    total as f64 / (1024.0 * 1024.0)
}

async fn calc_dir_size_inner(dir: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_dir() {
                total += Box::pin(calc_dir_size_inner(&path)).await;
            } else if let Ok(meta) = entry.metadata().await {
                total += meta.len();
            }
        }
    }
    total
}
