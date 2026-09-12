use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub arch: &'static str,
    pub os: String,
    pub macos_major: u32,
    pub cpu_cores: usize,
}

#[tauri::command]
pub async fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        arch: std::env::consts::ARCH,
        os: detect_os(),
        macos_major: macos_major_version(),
        cpu_cores: std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4),
    }
}

fn detect_os() -> String {
    #[cfg(target_os = "macos")]
    return "macos".to_string();
    #[cfg(target_os = "windows")]
    return "windows".to_string();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return "other".to_string();
}

#[cfg(target_os = "macos")]
fn macos_major_version() -> u32 {
    std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().split('.').next()?.parse().ok())
        .unwrap_or(0)
}

#[cfg(not(target_os = "macos"))]
fn macos_major_version() -> u32 {
    0
}
