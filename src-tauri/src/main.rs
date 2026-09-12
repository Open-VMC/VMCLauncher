#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod error;
mod models;
mod services;

use models::ServerDetails;
use services::java_runtime::JavaRuntimeManager;
use services::plugin_marketplaces::PluginMarketplaceService;
use services::server_catalog::ServerCatalogService;
use services::server_manager::ServerManager;
use services::storage::{LauncherPaths, LauncherStateStore};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tokio::sync::Mutex;

pub struct AppState {
    pub store: Mutex<LauncherStateStore>,
    pub java: Mutex<JavaRuntimeManager>,
    pub servers: Mutex<ServerManager>,
    pub plugins: PluginMarketplaceService,
    pub catalog: Mutex<ServerCatalogService>,
    pub close_to_tray: Arc<AtomicBool>,
    pub stop_on_quit: Arc<AtomicBool>,
    pub show_tray_icon: Arc<AtomicBool>,
    pub details_cache: Mutex<HashMap<String, ServerDetails>>,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");

            let paths = LauncherPaths::from_app_data(&app_data);
            let store =
                LauncherStateStore::load(paths.clone()).expect("Failed to load launcher state");

            let close_to_tray = Arc::new(AtomicBool::new(store.state.settings.close_to_tray));
            let stop_on_quit = Arc::new(AtomicBool::new(store.state.settings.stop_servers_on_quit));
            let show_tray_icon_val = store.state.settings.show_tray_icon;
            let show_tray_icon = Arc::new(AtomicBool::new(show_tray_icon_val));

            let http = reqwest::Client::builder()
                .user_agent("OpenVMC/vmc-launcher")
                .build()
                .expect("Failed to create HTTP client");

            let java = JavaRuntimeManager::new(paths.runtimes_dir.clone());
            let servers = ServerManager::new(http.clone());
            let plugins = PluginMarketplaceService::new(http.clone(), paths.cache_dir.clone());
            let catalog = ServerCatalogService::new(http);

            app.manage(AppState {
                store: Mutex::new(store),
                java: Mutex::new(java),
                servers: Mutex::new(servers),
                plugins,
                catalog: Mutex::new(catalog),
                close_to_tray,
                stop_on_quit,
                show_tray_icon,
                details_cache: Mutex::new(HashMap::new()),
            });

            // System tray
            let show = tauri::menu::MenuItemBuilder::new("Afficher")
                .id("show")
                .build(app)?;
            let quit = tauri::menu::MenuItemBuilder::new("Quitter")
                .id("quit")
                .build(app)?;
            let menu = tauri::menu::MenuBuilder::new(app)
                .items(&[&show, &quit])
                .build()?;

            let tray_icon = tauri::image::Image::from_bytes(
                include_bytes!("../icons/tray-icon.png"),
            )?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("VMC Launcher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            let state = app.state::<AppState>();
                            if state.stop_on_quit.load(Ordering::Relaxed) {
                                let app = app.clone();
                                tauri::async_runtime::spawn(async move {
                                    graceful_stop_all(&app).await;
                                    app.exit(0);
                                });
                            } else {
                                app.exit(0);
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            if !show_tray_icon_val {
                let _ = _tray.set_visible(false);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                let state = window.app_handle().state::<AppState>();

                if state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                    return;
                }

                if state.stop_on_quit.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let app = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        graceful_stop_all(&app).await;
                        app.exit(0);
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::platform::get_platform_info,
            commands::snapshot::get_snapshot,
            commands::snapshot::get_server_details,
            commands::snapshot::get_cached_server_details,
            commands::snapshot::get_server_stats,
            commands::server::create_server,
            commands::server::delete_server,
            commands::server::rename_server,
            commands::server::open_server_window,
            commands::server::start_server,
            commands::server::stop_server,
            commands::server::send_console_command,
            commands::server::update_server_settings,
            commands::server::update_server_setting,
            commands::files::list_server_files,
            commands::files::read_server_file,
            commands::files::write_server_file,
            commands::files::delete_server_files,
            commands::files::copy_server_files,
            commands::files::move_server_files,
            commands::files::create_server_directory,
            commands::files::upload_server_files,
            commands::plugins::search_plugins,
            commands::plugins::browse_plugins,
            commands::plugins::install_plugin,
            commands::plugins::search_pumpkin_market,
            commands::plugins::install_patchbukkit,
            commands::plugins::check_patchbukkit_installed,
            commands::plugins::resolve_plugin_info,
            commands::plugins::list_plugin_versions,
            commands::plugins::install_plugin_version,
            commands::plugins::toggle_plugin,
            commands::plugins::upload_plugin_files,
            commands::server::set_server_auto_update,
            commands::server::check_server_update,
            commands::server::switch_server_version,
            commands::server::list_pumpkin_versions,
            commands::settings::get_launcher_settings,
            commands::settings::update_launcher_setting,
            commands::settings::get_data_dir,
            commands::settings::open_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn graceful_stop_all(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let servers = state.servers.lock().await;
    let running_uuids: Vec<String> = servers.runtimes.keys().cloned().collect();
    for uuid in &running_uuids {
        if let Some(runtime) = servers.runtimes.get(uuid) {
            let _ = runtime.stdin_tx.send("stop".to_string()).await;
        }
    }
    drop(servers);
    if !running_uuids.is_empty() {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
}
