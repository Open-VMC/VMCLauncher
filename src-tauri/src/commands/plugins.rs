use crate::error::AppError;
use crate::models::*;
use crate::services::downloads;
use crate::services::plugin_marketplaces::ResolvedPluginInfo;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn search_plugins(
    state: State<'_, AppState>,
    payload: PluginSearchRequest,
) -> Result<Vec<PluginSearchResult>, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&payload.server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {}", payload.server_uuid)))?;
    let version = if server.record.kind == ServerKind::Pumpkin {
        String::new()
    } else {
        server.record.version.clone()
    };
    drop(store);

    state.plugins.search(&payload, &version).await
}

#[tauri::command]
pub async fn install_plugin(
    state: State<'_, AppState>,
    payload: PluginInstallRequest,
) -> Result<PluginInstallResult, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&payload.server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {}", payload.server_uuid)))?;
    let is_pumpkin = server.record.kind == ServerKind::Pumpkin;
    let version = if is_pumpkin { String::new() } else { server.record.version.clone() };
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);

    let target_dir = plugins_dir(&root, is_pumpkin, true);
    state
        .plugins
        .install(&payload, &version, &target_dir)
        .await
}

fn plugins_dir(root: &std::path::Path, is_pumpkin: bool, is_jar_provider: bool) -> PathBuf {
    if is_pumpkin && is_jar_provider {
        root.join("plugins").join("data").join("patchbukkit").join("patchbukkit-plugins")
    } else {
        root.join("plugins")
    }
}

#[tauri::command]
pub async fn browse_plugins(
    state: State<'_, AppState>,
    payload: BrowsePluginsRequest,
) -> Result<Vec<PluginSearchResult>, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&payload.server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {}", payload.server_uuid)))?;
    let version = if server.record.kind == ServerKind::Pumpkin {
        String::new()
    } else {
        server.record.version.clone()
    };
    drop(store);

    state.plugins.browse(&payload, &version).await
}

#[tauri::command]
pub async fn search_pumpkin_market(
    state: State<'_, AppState>,
    sort: String,
) -> Result<Vec<PumpkinMarketPlugin>, AppError> {
    let servers = state.servers.lock().await;
    downloads::search_pumpkin_market(&servers.http, &sort).await
}

#[tauri::command]
pub async fn install_patchbukkit(
    state: State<'_, AppState>,
    server_uuid: String,
) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    if server.record.kind != ServerKind::Pumpkin {
        return Err(AppError::Generic("PatchBukkit is only for Pumpkin servers".into()));
    }
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);

    let plugins_dir = root.join("plugins");
    tokio::fs::create_dir_all(&plugins_dir).await?;

    let servers = state.servers.lock().await;
    let artifact = downloads::resolve_patchbukkit_artifact(&servers.http).await?;
    let dest = plugins_dir.join(&artifact.file_name);
    drop(servers);

    if dest.exists() {
        tokio::fs::remove_file(&dest).await?;
    }

    let servers = state.servers.lock().await;
    downloads::download_file(&servers.http, &artifact.url, &dest).await?;
    drop(servers);

    let patchbukkit_plugins = root.join("plugins").join("data").join("patchbukkit").join("patchbukkit-plugins");
    tokio::fs::create_dir_all(&patchbukkit_plugins).await?;

    Ok(())
}

#[tauri::command]
pub async fn check_patchbukkit_installed(
    state: State<'_, AppState>,
    server_uuid: String,
) -> Result<bool, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);

    let plugins_dir = root.join("plugins");
    if !plugins_dir.exists() {
        return Ok(false);
    }

    let mut entries = tokio::fs::read_dir(&plugins_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with("libpatchbukkit") || name_str.starts_with("patchbukkit") {
            if name_str.ends_with(".dylib") || name_str.ends_with(".so") || name_str.ends_with(".dll") {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn list_plugin_versions(
    state: State<'_, AppState>,
    server_uuid: String,
    provider: PluginProvider,
    project_id: String,
    slug: String,
    author: String,
) -> Result<Vec<PluginVersionEntry>, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {}", server_uuid)))?;
    let version = if server.record.kind == ServerKind::Pumpkin {
        String::new()
    } else {
        server.record.version.clone()
    };
    drop(store);

    state
        .plugins
        .list_versions(&provider, &project_id, &slug, &author, &version)
        .await
}

#[tauri::command]
pub async fn install_plugin_version(
    state: State<'_, AppState>,
    payload: InstallPluginVersionRequest,
) -> Result<String, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&payload.server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {}", payload.server_uuid)))?;
    let root = PathBuf::from(&server.record.root_dir);
    let is_pumpkin = server.record.kind == ServerKind::Pumpkin;
    drop(store);

    let target_dir = plugins_dir(&root, is_pumpkin, true);
    state
        .plugins
        .install_version(&payload.file_url, &payload.file_name, &payload.old_file_name, &target_dir)
        .await
}

#[tauri::command]
pub async fn resolve_plugin_info(
    state: State<'_, AppState>,
    plugin_name: String,
) -> Result<Option<ResolvedPluginInfo>, AppError> {
    Ok(state.plugins.resolve_by_name(&plugin_name).await)
}

#[tauri::command]
pub async fn toggle_plugin(
    state: State<'_, AppState>,
    server_uuid: String,
    file_name: String,
    enabled: bool,
) -> Result<String, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    let is_pumpkin = server.record.kind == ServerKind::Pumpkin;
    drop(store);

    let is_jar = file_name.ends_with(".jar") || file_name.ends_with(".jar.disabled");
    let plugins_dir = plugins_dir(&root, is_pumpkin, is_jar);
    let current = plugins_dir.join(&file_name);
    let new_name = if enabled {
        file_name.strip_suffix(".disabled").unwrap_or(&file_name).to_string()
    } else if !file_name.ends_with(".disabled") {
        format!("{}.disabled", file_name)
    } else {
        file_name.clone()
    };
    let new_path = plugins_dir.join(&new_name);

    if current != new_path && current.exists() {
        tokio::fs::rename(&current, &new_path).await?;
    }

    Ok(new_name)
}

#[tauri::command]
pub async fn upload_plugin_files(
    state: State<'_, AppState>,
    server_uuid: String,
    file_paths: Vec<String>,
) -> Result<u32, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    let is_pumpkin = server.record.kind == ServerKind::Pumpkin;
    drop(store);

    let dest_dir = if is_pumpkin {
        root.join("plugins").join("data").join("patchbukkit").join("patchbukkit-plugins")
    } else {
        root.join("plugins")
    };
    tokio::fs::create_dir_all(&dest_dir).await?;

    let mut count = 0u32;
    for path_str in &file_paths {
        let src = PathBuf::from(path_str);
        if let Some(name) = src.file_name() {
            let target = dest_dir.join(name);
            tokio::fs::copy(&src, &target).await?;
            count += 1;
        }
    }
    Ok(count)
}
