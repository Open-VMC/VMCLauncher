use crate::error::AppError;
use crate::models::*;
use crate::services::downloads;
use crate::services::server_manager::{
    camel_to_prop_key, generate_server_properties, patch_pumpkin_config,
    patch_server_property, value_to_prop_string,
};
use crate::AppState;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};


#[tauri::command]
pub async fn create_server(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    payload: CreateServerPayload,
) -> Result<ServerRecord, AppError> {
    let mut store = state.store.lock().await;
    let mut java = state.java.lock().await;
    let servers = state.servers.lock().await;
    let record = servers.create_server(&mut store, &mut java, payload).await?;
    let _ = app_handle.emit(
        "launcher:event",
        LauncherEvent { console_line: None,
            event_type: "state-changed".to_string(),
            server_uuid: Some(record.server_uuid.clone()),
            progress: None,
        },
    );
    Ok(record)
}

#[tauri::command]
pub async fn delete_server(
    state: State<'_, AppState>,
    server_uuid: String,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    let mut servers = state.servers.lock().await;
    servers.delete_server(&mut store, &server_uuid).await
}

#[tauri::command]
pub async fn rename_server(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    server_uuid: String,
    new_name: String,
) -> Result<ServerRecord, AppError> {
    let mut store = state.store.lock().await;
    let servers = state.servers.lock().await;
    let record = servers
        .rename_server(&mut store, &server_uuid, new_name)
        .await?;
    let _ = app_handle.emit(
        "launcher:event",
        LauncherEvent { console_line: None,
            event_type: "state-changed".to_string(),
            server_uuid: Some(server_uuid),
            progress: None,
        },
    );
    Ok(record)
}

#[tauri::command]
pub async fn open_server_window(
    app_handle: AppHandle,
    server_uuid: String,
) -> Result<(), AppError> {
    let label = format!("server-{server_uuid}");
    if app_handle.get_webview_window(&label).is_some() {
        return Ok(());
    }

    let url = WebviewUrl::App(format!("index.html#/server/{server_uuid}/console").into());
    let mut builder = WebviewWindowBuilder::new(&app_handle, &label, url)
        .title("VMC | Server".to_string())
        .inner_size(1400.0, 900.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .hidden_title(true);

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);
    }

    builder.build().map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub async fn start_server(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    server_uuid: String,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    let mut servers = state.servers.lock().await;
    servers
        .start_server(&mut store, app_handle, &server_uuid)
        .await
}

#[tauri::command]
pub async fn stop_server(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    server_uuid: String,
) -> Result<(), AppError> {
    let mut servers = state.servers.lock().await;
    servers.stop_server(&server_uuid, app_handle).await
}

#[tauri::command]
pub async fn send_console_command(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    server_uuid: String,
    command: String,
) -> Result<(), AppError> {
    let servers = state.servers.lock().await;
    servers.send_command(&server_uuid, command, &app_handle).await
}

#[tauri::command]
pub async fn update_server_setting(
    state: State<'_, AppState>,
    server_uuid: String,
    field: String,
    value: serde_json::Value,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    let server = store
        .find_server_mut(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;

    // Handle top-level ServerRecord fields separately from nested settings
    match field.as_str() {
        "autoUpdate" => {
            server.record.auto_update = value.as_bool().unwrap_or(true);
            server.record.updated_at = chrono::Utc::now().to_rfc3339();
            store.update_and_save()?;
            return Ok(());
        }
        "version" => {
            server.record.version = value.as_str().unwrap_or("latest").to_string();
            server.record.updated_at = chrono::Utc::now().to_rfc3339();
            store.update_and_save()?;
            return Ok(());
        }
        _ => {}
    }

    let mut settings_json = serde_json::to_value(&server.record.settings)
        .map_err(|e| AppError::Generic(e.to_string()))?;
    settings_json[&field] = value.clone();
    server.record.settings = serde_json::from_value(settings_json)
        .map_err(|e| AppError::Generic(e.to_string()))?;
    server.record.updated_at = chrono::Utc::now().to_rfc3339();
    let root = std::path::PathBuf::from(&server.record.root_dir);
    let is_pumpkin = server.record.kind == ServerKind::Pumpkin;
    store.update_and_save()?;
    drop(store);

    if is_pumpkin {
        patch_pumpkin_config(&root, &field, &value).await?;
    } else {
        let props_path = root.join("server.properties");
        let prop_key = camel_to_prop_key(&field);
        if !prop_key.is_empty() {
            let prop_value = value_to_prop_string(&value);
            patch_server_property(&props_path, prop_key, &prop_value).await?;
            if field == "whiteList" {
                patch_server_property(&props_path, "enforce-whitelist", &prop_value).await?;
            }
        }
        // else: unrecognized field — skip rather than write a malformed key
    }

    Ok(())
}

#[tauri::command]
pub async fn update_server_settings(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    payload: UpdateServerSettingsPayload,
) -> Result<ServerRecord, AppError> {
    let mut store = state.store.lock().await;
    let server = store
        .find_server_mut(&payload.server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {}", payload.server_uuid)))?;

    server.record.settings = payload.settings;
    server.record.updated_at = chrono::Utc::now().to_rfc3339();
    let record = server.record.clone();
    let port = server.paper_port;
    let is_pumpkin = record.kind == ServerKind::Pumpkin;
    store.update_and_save()?;

    let root = std::path::PathBuf::from(&record.root_dir);
    if is_pumpkin {
        let settings_json = serde_json::to_value(&record.settings)
            .map_err(|e| AppError::Generic(e.to_string()))?;
        if let Some(obj) = settings_json.as_object() {
            for (field, value) in obj {
                patch_pumpkin_config(&root, field, value).await?;
            }
        }
    } else {
        generate_server_properties(&root, &record.settings, port, true).await?;
    }

    let _ = app_handle.emit(
        "launcher:event",
        LauncherEvent { console_line: None,
            event_type: "server-updated".to_string(),
            server_uuid: Some(payload.server_uuid),
            progress: None,
        },
    );
    Ok(record)
}

#[tauri::command]
pub async fn set_server_auto_update(
    state: State<'_, AppState>,
    server_uuid: String,
    enabled: bool,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    let server = store
        .find_server_mut(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    server.record.auto_update = enabled;
    server.record.updated_at = chrono::Utc::now().to_rfc3339();
    store.update_and_save()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_build: Option<String>,
    pub latest_build: String,
}

#[tauri::command]
pub async fn check_server_update(
    state: State<'_, AppState>,
    server_uuid: String,
) -> Result<UpdateCheckResult, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;

    let current_version = server.record.version.clone();
    let kind = server.record.kind.clone();
    drop(store);

    let servers = state.servers.lock().await;
    let latest = match kind {
        ServerKind::Pumpkin => downloads::check_pumpkin_latest_tag(&servers.http).await?,
        _ => return Err(AppError::Generic("Auto-update not yet supported for this server type".into())),
    };

    Ok(UpdateCheckResult {
        has_update: current_version != latest,
        current_build: Some(current_version),
        latest_build: latest,
    })
}

#[tauri::command]
pub async fn switch_server_version(
    state: State<'_, AppState>,
    server_uuid: String,
    tag: String,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    let server = store
        .find_server_mut(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;

    if server.record.kind != ServerKind::Pumpkin {
        return Err(AppError::Generic("Version switching only supported for Pumpkin".into()));
    }

    let server_dir = std::path::PathBuf::from(&server.record.root_dir);
    drop(store);

    let servers = state.servers.lock().await;
    let artifact = downloads::resolve_pumpkin_artifact_version(&servers.http, &tag).await?;
    let bin_dest = server_dir.join(&artifact.file_name);

    if bin_dest.exists() {
        tokio::fs::remove_file(&bin_dest).await?;
    }
    downloads::download_file(&servers.http, &artifact.url, &bin_dest).await?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&bin_dest).await?.permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&bin_dest, perms).await?;
    }

    drop(servers);

    let mut store = state.store.lock().await;
    let server = store
        .find_server_mut(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    server.record.version = tag;
    server.record.updated_at = chrono::Utc::now().to_rfc3339();
    store.update_and_save()
}

#[tauri::command]
pub async fn list_pumpkin_versions(
    state: State<'_, AppState>,
) -> Result<Vec<String>, AppError> {
    let servers = state.servers.lock().await;
    downloads::list_pumpkin_releases(&servers.http).await
}

