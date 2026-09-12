use crate::error::AppError;
use crate::models::LauncherSettings;
use crate::AppState;
use std::sync::atomic::Ordering;
use tauri::State;
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub async fn get_launcher_settings(state: State<'_, AppState>) -> Result<LauncherSettings, AppError> {
    let store = state.store.lock().await;
    Ok(store.state.settings.clone())
}

#[tauri::command]
pub async fn update_launcher_setting(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    field: String,
    value: serde_json::Value,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    match field.as_str() {
        "closeToTray" => {
            if let Some(v) = value.as_bool() {
                store.state.settings.close_to_tray = v;
                state.close_to_tray.store(v, Ordering::Relaxed);
            }
        }
        "stopServersOnQuit" => {
            if let Some(v) = value.as_bool() {
                store.state.settings.stop_servers_on_quit = v;
                state.stop_on_quit.store(v, Ordering::Relaxed);
            }
        }
        "notificationsEnabled" => {
            if let Some(v) = value.as_bool() {
                store.state.settings.notifications_enabled = v;
            }
        }
        "showTrayIcon" => {
            if let Some(v) = value.as_bool() {
                store.state.settings.show_tray_icon = v;
                state.show_tray_icon.store(v, Ordering::Relaxed);
                store.save()?;
                drop(store);
                if let Some(tray) = app.tray_by_id("main-tray") {
                    tray.set_visible(v).ok();
                }
                return Ok(());
            }
        }
        "autostart" => {
            if let Some(v) = value.as_bool() {
                store.state.settings.autostart = v;
                store.save()?;
                drop(store);
                let autolaunch = app.autolaunch();
                if v {
                    autolaunch.enable().map_err(|e| AppError::Generic(e.to_string()))?;
                } else {
                    autolaunch.disable().map_err(|e| AppError::Generic(e.to_string()))?;
                }
                return Ok(());
            }
        }
        _ => {}
    }
    store.save()?;
    Ok(())
}

#[tauri::command]
pub async fn get_data_dir(state: State<'_, AppState>) -> Result<String, AppError> {
    let store = state.store.lock().await;
    Ok(store.paths.root_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_data_dir(state: State<'_, AppState>) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let path = store.paths.root_dir.to_string_lossy().to_string();
    drop(store);

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Generic(e.to_string()))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Generic(e.to_string()))?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Generic(e.to_string()))?;
    }

    Ok(())
}
