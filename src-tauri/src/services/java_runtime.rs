use crate::error::AppError;
use crate::services::downloads;
use reqwest::Client;
use std::path::{Path, PathBuf};

pub struct JavaRuntimeManager {
    runtimes_dir: PathBuf,
}

impl JavaRuntimeManager {
    pub fn new(runtimes_dir: PathBuf) -> Self {
        Self { runtimes_dir }
    }

    pub async fn ensure_java(&self, client: &Client) -> Result<PathBuf, AppError> {
        self.ensure_java_version(client, 21).await
    }

    pub async fn ensure_java_version(&self, client: &Client, version: u32) -> Result<PathBuf, AppError> {
        let version_dir = self.runtimes_dir.join(format!("java-{version}"));

        if version_dir.exists() {
            if let Some(bin) = find_java_in(&version_dir) {
                return Ok(bin);
            }
        }

        tokio::fs::create_dir_all(&version_dir).await?;

        let url = downloads::resolve_temurin_binary_url(client, version).await?;
        let ext = if cfg!(target_os = "windows") { "zip" } else { "tar.gz" };
        let archive_path = self.runtimes_dir.join(format!("temurin-{version}.{ext}"));

        downloads::download_file(client, &url, &archive_path).await?;
        extract_to(&archive_path, &version_dir).await?;

        find_java_in(&version_dir)
            .ok_or_else(|| AppError::Generic(format!("Java {version} binary not found after extraction")))
    }
}

async fn extract_to(archive: &Path, dest: &Path) -> Result<(), AppError> {
    let archive = archive.to_path_buf();
    let dest = dest.to_path_buf();

    let status = if cfg!(target_os = "windows") {
        let script = format!(
            "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
            archive.display(),
            dest.display()
        );
        tokio::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .status()
            .await?
    } else {
        tokio::process::Command::new("tar")
            .args(["xzf", &archive.to_string_lossy(), "-C", &dest.to_string_lossy()])
            .status()
            .await?
    };
    if !status.success() {
        return Err(AppError::Generic(format!("archive extraction failed with {status}")));
    }
    Ok(())
}

fn find_java_in(dir: &Path) -> Option<PathBuf> {
    let bin_name = if cfg!(target_os = "windows") { "java.exe" } else { "java" };
    find_recursive(dir, bin_name)
}

fn find_recursive(dir: &Path, target: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().map(|n| n == target).unwrap_or(false) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_recursive(&path, target) {
                return Some(found);
            }
        }
    }
    None
}
