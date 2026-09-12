use crate::error::AppError;
use futures_util::StreamExt;
use reqwest::Client;
use std::path::Path;

static PAPER_API: &str = "https://fill.papermc.io/v3";
static ADOPTIUM_API: &str = "https://api.adoptium.net/v3";

#[derive(Debug)]
pub struct ArtifactInfo {
    pub url: String,
    pub file_name: String,
}

// PaperMC v3: /versions/{version}/builds renvoie directement un tableau de builds
pub async fn resolve_paper_artifact(
    client: &Client,
    version: &str,
) -> Result<ArtifactInfo, AppError> {
    let url = format!("{PAPER_API}/projects/paper/versions/{version}/builds");
    let builds: Vec<serde_json::Value> = client.get(&url).send().await?.json().await?;

    if builds.is_empty() {
        return Err(AppError::Generic(format!("No builds found for Paper {version}")));
    }

    let latest = builds
        .iter()
        .rev()
        .find(|b| b["channel"].as_str() == Some("STABLE"))
        .or_else(|| builds.last())
        .ok_or_else(|| AppError::Generic(format!("Empty builds for Paper {version}")))?;

    let download_url = latest["downloads"]["server:default"]["url"]
        .as_str()
        .ok_or_else(|| AppError::Generic(format!("Missing download URL for Paper {version}")))?
        .to_string();

    let file_name = download_url.split('/').last().unwrap_or("paper.jar").to_string();

    Ok(ArtifactInfo { url: download_url, file_name })
}

#[allow(dead_code)]
pub async fn resolve_velocity_artifact(
    client: &Client,
    version: &str,
) -> Result<ArtifactInfo, AppError> {
    let url = format!("{PAPER_API}/projects/velocity/versions/{version}/builds");
    let builds: Vec<serde_json::Value> = client.get(&url).send().await?.json().await?;

    if builds.is_empty() {
        return Err(AppError::Generic(format!("No builds found for Velocity {version}")));
    }

    let latest = builds
        .iter()
        .rev()
        .find(|b| b["channel"].as_str() == Some("STABLE"))
        .or_else(|| builds.last())
        .ok_or_else(|| AppError::Generic(format!("Empty builds for Velocity {version}")))?;

    let download_url = latest["downloads"]["server:default"]["url"]
        .as_str()
        .ok_or_else(|| AppError::Generic(format!("Missing download URL for Velocity {version}")))?
        .to_string();

    let file_name = download_url.split('/').last().unwrap_or("velocity.jar").to_string();

    Ok(ArtifactInfo { url: download_url, file_name })
}

pub async fn check_pumpkin_latest_tag(client: &Client) -> Result<String, AppError> {
    let resp: Vec<serde_json::Value> = client
        .get("https://api.github.com/repos/Pumpkin-MC/Pumpkin/releases?per_page=20")
        .header("User-Agent", "VMCLauncher")
        .send()
        .await?
        .json()
        .await?;

    for release in &resp {
        let tag = match release["tag_name"].as_str() {
            Some(t) => t,
            None => continue,
        };
        if tag == "latest" || tag == "nightly" {
            continue;
        }
        if release["prerelease"].as_bool() == Some(true) {
            continue;
        }
        return Ok(tag.to_string());
    }

    Err(AppError::Generic("No stable Pumpkin release found".into()))
}

pub async fn resolve_pumpkin_artifact(_client: &Client) -> Result<ArtifactInfo, AppError> {
    let arch = match std::env::consts::ARCH {
        "x86_64" => "X64",
        "aarch64" => "ARM64",
        other => return Err(AppError::Generic(format!("Unsupported arch for Pumpkin: {other}"))),
    };
    let (os_label, ext) = match std::env::consts::OS {
        "macos" => {
            if arch != "ARM64" {
                return Err(AppError::Generic(
                    "Pumpkin only supports Apple Silicon (ARM64) on macOS".into(),
                ));
            }
            ("macOS", "")
        }
        "windows" => ("Windows", ".exe"),
        "linux" => ("Linux", ""),
        other => return Err(AppError::Generic(format!("Unsupported OS for Pumpkin: {other}"))),
    };

    let file_name = format!("pumpkin-{arch}-{os_label}{ext}");
    let url = format!(
        "https://github.com/Pumpkin-MC/Pumpkin/releases/latest/download/{file_name}"
    );

    Ok(ArtifactInfo { url, file_name })
}

pub async fn resolve_pumpkin_artifact_version(
    _client: &Client,
    tag: &str,
) -> Result<ArtifactInfo, AppError> {
    let arch = match std::env::consts::ARCH {
        "x86_64" => "X64",
        "aarch64" => "ARM64",
        other => return Err(AppError::Generic(format!("Unsupported arch for Pumpkin: {other}"))),
    };
    let (os_label, ext) = match std::env::consts::OS {
        "macos" => {
            if arch != "ARM64" {
                return Err(AppError::Generic(
                    "Pumpkin only supports Apple Silicon (ARM64) on macOS".into(),
                ));
            }
            ("macOS", "")
        }
        "windows" => ("Windows", ".exe"),
        "linux" => ("Linux", ""),
        other => return Err(AppError::Generic(format!("Unsupported OS for Pumpkin: {other}"))),
    };

    let file_name = format!("pumpkin-{arch}-{os_label}{ext}");
    let encoded_tag = tag.replace('+', "%2B");
    let url = format!(
        "https://github.com/Pumpkin-MC/Pumpkin/releases/download/{encoded_tag}/{file_name}"
    );

    Ok(ArtifactInfo { url, file_name })
}

pub async fn list_pumpkin_releases(client: &Client) -> Result<Vec<String>, AppError> {
    let resp: Vec<serde_json::Value> = client
        .get("https://api.github.com/repos/Pumpkin-MC/Pumpkin/releases")
        .header("User-Agent", "VMCLauncher")
        .query(&[("per_page", "20")])
        .send()
        .await?
        .json()
        .await?;

    Ok(resp
        .iter()
        .filter_map(|r| r["tag_name"].as_str().map(|s| s.to_string()))
        .collect())
}

pub async fn resolve_patchbukkit_artifact(_client: &Client) -> Result<ArtifactInfo, AppError> {
    let arch = match std::env::consts::ARCH {
        "x86_64" => "X64",
        "aarch64" => "ARM64",
        other => return Err(AppError::Generic(format!("Unsupported arch for PatchBukkit: {other}"))),
    };
    let (os_label, prefix, ext) = match std::env::consts::OS {
        "macos" => ("macOS", "lib", ".dylib"),
        "windows" => ("Windows", "", ".dll"),
        "linux" => ("Linux", "lib", ".so"),
        other => return Err(AppError::Generic(format!("Unsupported OS for PatchBukkit: {other}"))),
    };

    let file_name = format!("{prefix}patchbukkit-{arch}-{os_label}{ext}");
    let url = format!(
        "https://github.com/Pumpkin-MC/PatchBukkit/releases/latest/download/{file_name}"
    );

    Ok(ArtifactInfo { url, file_name })
}

use crate::models::PumpkinMarketPlugin;

#[derive(Debug, serde::Deserialize)]
struct PumpkinMarketRaw {
    id: u64,
    name: String,
    #[serde(rename = "type")]
    plugin_type: String,
    #[serde(default)]
    price_cents: u64,
    #[serde(default)]
    price: f64,
    #[serde(default)]
    sale_active: bool,
    #[serde(default)]
    sale_discount_percent: u64,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    category: String,
    #[serde(default)]
    preview_path: Option<String>,
    #[serde(default)]
    translated_descriptions: std::collections::HashMap<String, String>,
    #[serde(default)]
    dev_name: String,
    #[serde(default)]
    screenshots: Vec<String>,
    #[serde(default)]
    is_early_access: bool,
    #[serde(default)]
    is_preorder: bool,
    #[serde(default)]
    preorder_release_date: Option<String>,
    #[serde(default)]
    version: String,
    #[serde(default)]
    status: String,
}

pub async fn search_pumpkin_market(
    client: &Client,
    sort: &str,
) -> Result<Vec<PumpkinMarketPlugin>, AppError> {
    let url = format!("https://market.pumpkinmc.org/api/plugins?sort={sort}");
    let raw: Vec<PumpkinMarketRaw> = client
        .get(&url)
        .header("User-Agent", "VMCLauncher")
        .send()
        .await?
        .json()
        .await?;

    Ok(raw.into_iter().map(|r| PumpkinMarketPlugin {
        id: r.id,
        name: r.name,
        plugin_type: r.plugin_type,
        price_cents: r.price_cents,
        price: r.price,
        sale_active: r.sale_active,
        sale_discount_percent: r.sale_discount_percent,
        downloads: r.downloads,
        category: r.category,
        preview_path: r.preview_path,
        translated_descriptions: r.translated_descriptions,
        dev_name: r.dev_name,
        screenshots: r.screenshots,
        is_early_access: r.is_early_access,
        is_preorder: r.is_preorder,
        preorder_release_date: r.preorder_release_date,
        version: r.version,
        status: r.status,
    }).collect())
}

pub async fn resolve_temurin_binary_url(client: &Client, version: u32) -> Result<String, AppError> {
    let os = match std::env::consts::OS {
        "macos" => "mac",
        "windows" => "windows",
        "linux" => "linux",
        other => return Err(AppError::Generic(format!("Unsupported OS: {other}"))),
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "aarch64",
        other => return Err(AppError::Generic(format!("Unsupported arch: {other}"))),
    };

    let url = format!(
        "{ADOPTIUM_API}/assets/latest/{version}/hotspot?architecture={arch}&image_type=jre&os={os}&vendor=eclipse"
    );
    let resp: serde_json::Value = client.get(&url).send().await?.json().await?;

    let assets = resp
        .as_array()
        .ok_or_else(|| AppError::Generic("No Temurin assets found".into()))?;

    let link = assets
        .first()
        .and_then(|a| a["binary"]["package"]["link"].as_str())
        .ok_or_else(|| AppError::Generic("No Temurin download link".into()))?;

    Ok(link.to_string())
}

pub async fn download_file(client: &Client, url: &str, dest: &Path) -> Result<(), AppError> {
    if dest.exists() {
        return Ok(());
    }

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let tmp = dest.with_extension("tmp");
    let resp = client.get(url).send().await?.error_for_status()?;
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(&tmp).await?;

    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(AppError::Http)?;
        file.write_all(&bytes).await?;
    }
    file.flush().await?;
    drop(file);

    tokio::fs::rename(&tmp, dest).await?;
    Ok(())
}
