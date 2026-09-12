use crate::error::AppError;
use crate::models::*;
use crate::services::server_manager;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn list_server_files(
    state: State<'_, AppState>,
    server_uuid: String,
    relative_path: String,
) -> Result<Vec<FileEntry>, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);
    server_manager::list_files(&root, &relative_path).await
}

#[tauri::command]
pub async fn read_server_file(
    state: State<'_, AppState>,
    server_uuid: String,
    relative_path: String,
) -> Result<ServerFileContent, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);
    server_manager::read_file(&root, &relative_path).await
}

#[tauri::command]
pub async fn write_server_file(
    state: State<'_, AppState>,
    server_uuid: String,
    relative_path: String,
    content: String,
) -> Result<FileEntry, AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);
    server_manager::write_file(&root, &relative_path, &content).await
}

#[tauri::command]
pub async fn delete_server_files(
    state: State<'_, AppState>,
    server_uuid: String,
    relative_paths: Vec<String>,
) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);
    server_manager::delete_files(&root, &relative_paths).await
}

#[tauri::command]
pub async fn copy_server_files(
    state: State<'_, AppState>,
    server_uuid: String,
    relative_paths: Vec<String>,
    dest_relative_path: String,
) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);
    server_manager::copy_files(&root, &relative_paths, &dest_relative_path).await
}

#[tauri::command]
pub async fn move_server_files(
    state: State<'_, AppState>,
    server_uuid: String,
    relative_paths: Vec<String>,
    dest_relative_path: String,
) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);
    server_manager::move_files(&root, &relative_paths, &dest_relative_path).await
}

#[tauri::command]
pub async fn create_server_directory(
    state: State<'_, AppState>,
    server_uuid: String,
    relative_path: String,
) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);
    server_manager::create_directory(&root, &relative_path).await
}

#[tauri::command]
pub async fn upload_server_files(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_uuid: String,
    dest_relative_path: String,
    file_paths: Option<Vec<String>>,
    filter_extensions: Option<Vec<String>>,
) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let server = store
        .find_server(&server_uuid)
        .ok_or_else(|| AppError::NotFound(format!("Server {server_uuid}")))?;
    let root = PathBuf::from(&server.record.root_dir);
    drop(store);

    let dest = server_manager::resolve_safe_path(&root, &dest_relative_path)?;
    tokio::fs::create_dir_all(&dest).await?;

    let paths = if let Some(paths) = file_paths {
        paths.into_iter().map(PathBuf::from).collect::<Vec<_>>()
    } else {
        let dialog = app_handle.dialog();
        let mut builder = dialog.file();
        if let Some(exts) = &filter_extensions {
            let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
            builder = builder.add_filter("Plugins", &ext_refs);
        }
        let files = builder.blocking_pick_files();
        match files {
            Some(paths) => paths.iter().filter_map(|p| p.as_path().map(|p| p.to_path_buf())).collect(),
            None => return Ok(()),
        }
    };

    for src in paths {
        if let Some(name) = src.file_name() {
            let target = dest.join(name);
            tokio::fs::copy(&src, &target).await?;
        }
    }

    Ok(())
}
