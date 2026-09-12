use crate::error::AppError;
use crate::models::{ServerCatalogEntry, ServerCatalogVersionEntry, ServerKind};
use reqwest::Client;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const CACHE_TTL: Duration = Duration::from_secs(300);

static PAPER_API: &str = "https://fill.papermc.io/v3";
static FABRIC_META_API: &str = "https://meta.fabricmc.net/v2";
static VANILLA_MANIFEST: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

struct CatalogCache {
    entries: Vec<ServerCatalogEntry>,
    fetched_at: Instant,
}

pub struct ServerCatalogService {
    client: Client,
    cache: Arc<Mutex<Option<CatalogCache>>>,
}

impl ServerCatalogService {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            cache: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn get_catalog(&self) -> Result<Vec<ServerCatalogEntry>, AppError> {
        let mut cache = self.cache.lock().await;
        if let Some(ref cached) = *cache {
            if cached.fetched_at.elapsed() < CACHE_TTL {
                return Ok(cached.entries.clone());
            }
        }

        let entries = self.fetch_catalog().await?;
        *cache = Some(CatalogCache {
            entries: entries.clone(),
            fetched_at: Instant::now(),
        });
        Ok(entries)
    }

    async fn fetch_catalog(&self) -> Result<Vec<ServerCatalogEntry>, AppError> {
        let (vanilla, paper, fabric, pumpkin) = tokio::join!(
            self.fetch_vanilla_versions(),
            self.fetch_paper_versions(),
            self.fetch_fabric_versions(),
            self.fetch_pumpkin_versions(),
        );

        let mut entries = Vec::new();

        if let Ok(versions) = paper {
            entries.push(ServerCatalogEntry {
                kind: ServerKind::PaperMc,
                label: "Paper".to_string(),
                subtitle: "Builds stables Paper".to_string(),
                versions,
            });
        }

        if let Ok(versions) = vanilla {
            entries.push(ServerCatalogEntry {
                kind: ServerKind::Vanilla,
                label: "Vanilla".to_string(),
                subtitle: "Minecraft officiel".to_string(),
                versions,
            });
        }

        if let Ok(versions) = fabric {
            entries.push(ServerCatalogEntry {
                kind: ServerKind::Fabric,
                label: "Fabric".to_string(),
                subtitle: "Modded Fabric server".to_string(),
                versions,
            });
        }

        entries.push(ServerCatalogEntry {
            kind: ServerKind::Forge,
            label: "Forge".to_string(),
            subtitle: "Modded Forge server".to_string(),
            versions: vec![],
        });

        entries.push(ServerCatalogEntry {
            kind: ServerKind::NeoForge,
            label: "NeoForge".to_string(),
            subtitle: "Fork communautaire de Forge".to_string(),
            versions: vec![],
        });

        entries.push(ServerCatalogEntry {
            kind: ServerKind::Pumpkin,
            label: "Pumpkin".to_string(),
            subtitle: "Serveur Minecraft en Rust (beta)".to_string(),
            versions: pumpkin.unwrap_or_else(|_| vec![ServerCatalogVersionEntry {
                version: "latest".to_string(),
                download_url: String::new(),
                java_version: 0,
            }]),
        });

        Ok(entries)
    }

    async fn fetch_paper_versions(&self) -> Result<Vec<ServerCatalogVersionEntry>, AppError> {
        let url = format!("{PAPER_API}/projects/paper");
        let resp: serde_json::Value = self.client.get(&url).send().await?.json().await?;

        let versions_obj = resp["versions"]
            .as_object()
            .ok_or_else(|| AppError::Generic("No Paper versions".into()))?;

        let mut entries: Vec<ServerCatalogVersionEntry> = Vec::new();
        for (_group, sub_versions) in versions_obj {
            if let Some(arr) = sub_versions.as_array() {
                for v in arr {
                    if let Some(version) = v.as_str() {
                        if version.contains("-rc") || version.contains("-pre") {
                            continue;
                        }
                        let java_version = resolve_java_version(version);
                        entries.push(ServerCatalogVersionEntry {
                            download_url: String::new(),
                            version: version.to_string(),
                            java_version,
                        });
                    }
                }
            }
        }

        entries.sort_by(|a, b| version_sort_key(&b.version).cmp(&version_sort_key(&a.version)));
        Ok(entries)
    }

    async fn fetch_vanilla_versions(&self) -> Result<Vec<ServerCatalogVersionEntry>, AppError> {
        let resp: serde_json::Value =
            self.client.get(VANILLA_MANIFEST).send().await?.json().await?;

        let versions = resp["versions"]
            .as_array()
            .ok_or_else(|| AppError::Generic("No Vanilla versions".into()))?;

        let entries: Vec<ServerCatalogVersionEntry> = versions
            .iter()
            .filter(|v| v["type"].as_str() == Some("release"))
            .take(40)
            .filter_map(|v| {
                let version = v["id"].as_str()?.to_string();
                let download_url = v["url"].as_str()?.to_string();
                let java_version = resolve_java_version(&version);
                Some(ServerCatalogVersionEntry {
                    version,
                    download_url,
                    java_version,
                })
            })
            .collect();

        Ok(entries)
    }

    async fn fetch_fabric_versions(&self) -> Result<Vec<ServerCatalogVersionEntry>, AppError> {
        let url = format!("{FABRIC_META_API}/versions/game");
        let resp: Vec<serde_json::Value> = self.client.get(&url).send().await?.json().await?;

        let entries: Vec<ServerCatalogVersionEntry> = resp
            .iter()
            .filter(|v| v["stable"].as_bool() == Some(true))
            .take(30)
            .filter_map(|v| {
                let version = v["version"].as_str()?.to_string();
                let java_version = resolve_java_version(&version);
                Some(ServerCatalogVersionEntry {
                    version,
                    download_url: String::new(),
                    java_version,
                })
            })
            .collect();

        Ok(entries)
    }

    async fn fetch_pumpkin_versions(&self) -> Result<Vec<ServerCatalogVersionEntry>, AppError> {
        let resp: Vec<serde_json::Value> = self
            .client
            .get("https://api.github.com/repos/Pumpkin-MC/Pumpkin/releases?per_page=20")
            .header("User-Agent", "VMCLauncher")
            .send()
            .await?
            .json()
            .await?;

        let mut entries = vec![ServerCatalogVersionEntry {
            version: "latest".to_string(),
            download_url: String::new(),
            java_version: 0,
        }];

        for release in &resp {
            let tag = match release["tag_name"].as_str() {
                Some(t) => t,
                None => continue,
            };
            if tag == "latest" {
                continue;
            }
            entries.push(ServerCatalogVersionEntry {
                version: tag.to_string(),
                download_url: String::new(),
                java_version: 0,
            });
        }

        Ok(entries)
    }
}

pub fn resolve_java_version(mc_version: &str) -> u32 {
    let parts: Vec<u32> = mc_version
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();

    let major = parts.first().copied().unwrap_or(1);

    // New versioning format since 2026: YY.N (e.g. 26.1, 26.2)
    // All versions in this format require Java 25.
    if major > 1 {
        return 25;
    }

    // Legacy 1.X.Y
    let minor = parts.get(1).copied().unwrap_or(0);
    if minor >= 21 {
        21
    } else if minor >= 17 {
        17
    } else {
        8
    }
}

fn version_sort_key(version: &str) -> Vec<u32> {
    version
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect()
}
