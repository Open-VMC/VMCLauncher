use crate::error::AppError;
use crate::models::*;
use crate::services::server_manager;
use crate::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

fn local_ip() -> String {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| { s.connect("8.8.8.8:80")?; s.local_addr() })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLiveStats {
    pub status: ServerStatus,
    pub stats: ServerStats,
}

#[tauri::command]
pub async fn get_snapshot(state: State<'_, AppState>) -> Result<LauncherSnapshot, AppError> {
    let store = state.store.lock().await;
    let servers_mgr = state.servers.lock().await;

    let servers: Vec<ServerRecord> = store
        .state
        .servers
        .iter()
        .map(|s| {
            let mut record = s.record.clone();
            if let Some(status) = servers_mgr.get_runtime_status(&record.server_uuid) {
                record.status = status;
            } else if matches!(record.status, ServerStatus::Running | ServerStatus::Starting | ServerStatus::Stopping) {
                record.status = ServerStatus::Stopped;
            }
            record
        })
        .collect();

    let catalog = state.catalog.lock().await.get_catalog().await.unwrap_or_default();

    Ok(LauncherSnapshot {
        active_server_id: store.state.active_server_id.clone(),
        servers,
        catalog,
    })
}

#[tauri::command]
pub async fn get_server_stats(
    state: State<'_, AppState>,
    server_uuid: String,
) -> Result<ServerLiveStats, AppError> {
    let store = state.store.lock().await;
    let servers_mgr = state.servers.lock().await;

    let persisted = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;

    let mut status = persisted.record.status.clone();
    if let Some(runtime_status) = servers_mgr.get_runtime_status(&server_uuid) {
        status = runtime_status;
    } else if matches!(status, ServerStatus::Running | ServerStatus::Starting | ServerStatus::Stopping) {
        status = ServerStatus::Stopped;
    }

    let stats = servers_mgr.get_stats(&server_uuid).await;

    Ok(ServerLiveStats { status, stats })
}

#[tauri::command]
pub async fn get_server_details(
    state: State<'_, AppState>,
    server_uuid: String,
) -> Result<ServerDetails, AppError> {
    let store = state.store.lock().await;
    let servers_mgr = state.servers.lock().await;

    let persisted = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;

    let mut record = persisted.record.clone();
    if let Some(status) = servers_mgr.get_runtime_status(&server_uuid) {
        record.status = status;
    } else if matches!(record.status, ServerStatus::Running | ServerStatus::Starting | ServerStatus::Stopping) {
        record.status = ServerStatus::Stopped;
    }

    let root = PathBuf::from(&record.root_dir);
    let is_running = servers_mgr.is_running(&server_uuid);
    let mut stats = servers_mgr.get_stats(&server_uuid).await;
    if !is_running {
        stats.storage_mb = server_manager::calc_dir_size(&root).await;
        stats.ram_limit_mb = record.memory_mb as f64;
        stats.cpu_limit_percent = record.cpu_cores as f64 * 100.0;
    }
    let console_lines = servers_mgr.get_console_lines(&server_uuid).await;
    let is_pumpkin = record.kind == ServerKind::Pumpkin;
    let plugins = server_manager::list_plugins(&root, is_pumpkin).await?;
    let paper_port = persisted.paper_port;
    let local_ip = local_ip();

    let details = ServerDetails {
        server: record,
        stats,
        console_lines,
        plugins,
        paper_port,
        local_ip,
    };
    state.details_cache.lock().await.insert(server_uuid, details.clone());
    Ok(details)
}

#[tauri::command]
pub async fn get_cached_server_details(
    state: State<'_, AppState>,
    server_uuid: String,
) -> Result<Option<ServerDetails>, AppError> {
    Ok(state.details_cache.lock().await.get(&server_uuid).cloned())
}
