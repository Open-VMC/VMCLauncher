use crate::error::AppError;
use crate::models::*;
use crate::services::downloads;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub struct PluginMarketplaceService {
    http: Client,
    cache_dir: PathBuf,
}

impl PluginMarketplaceService {
    pub fn new(http: Client, cache_dir: PathBuf) -> Self {
        Self { http, cache_dir }
    }

    pub async fn search(
        &self,
        request: &PluginSearchRequest,
        server_version: &str,
    ) -> Result<Vec<PluginSearchResult>, AppError> {
        match request.provider {
            PluginProvider::Modrinth => self.search_modrinth(&request.query, server_version).await,
            PluginProvider::Curseforge => {
                self.search_curseforge(&request.query, server_version).await
            }
            PluginProvider::Hangar => self.search_hangar(&request.query, server_version).await,
        }
    }

    pub async fn browse(
        &self,
        request: &BrowsePluginsRequest,
        server_version: &str,
    ) -> Result<Vec<PluginSearchResult>, AppError> {
        match request.provider {
            PluginProvider::Modrinth => self.browse_modrinth(&request.sort, server_version).await,
            PluginProvider::Hangar => self.browse_hangar(&request.sort, server_version).await,
            PluginProvider::Curseforge => {
                Err(AppError::Generic("CurseForge browse not supported".into()))
            }
        }
    }

    pub async fn install(
        &self,
        request: &PluginInstallRequest,
        server_version: &str,
        plugins_dir: &Path,
    ) -> Result<PluginInstallResult, AppError> {
        match request.provider {
            PluginProvider::Modrinth => {
                self.install_modrinth(request, server_version, plugins_dir)
                    .await
            }
            PluginProvider::Curseforge => {
                self.install_curseforge(request, server_version, plugins_dir)
                    .await
            }
            PluginProvider::Hangar => {
                self.install_hangar(request, server_version, plugins_dir)
                    .await
            }
        }
    }

    // Modrinth

    async fn search_modrinth(
        &self,
        query: &str,
        server_version: &str,
    ) -> Result<Vec<PluginSearchResult>, AppError> {
        let facets = if server_version.is_empty() {
            r#"[["all_project_types:plugin"],["server_side:required","server_side:optional"]]"#.to_string()
        } else {
            format!(r#"[["all_project_types:plugin"],["versions:{server_version}"],["server_side:required","server_side:optional"]]"#)
        };
        let url = format!(
            "https://api.modrinth.com/v2/search?query={}&facets={}&limit=20",
            urlencoded(query),
            urlencoded(&facets)
        );
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await?
            .json()
            .await?;

        let hits = resp["hits"].as_array().cloned().unwrap_or_default();
        Ok(hits
            .iter()
            .map(|h| PluginSearchResult {
                provider: PluginProvider::Modrinth,
                project_id: h["project_id"].as_str().unwrap_or("").to_string(),
                slug: h["slug"].as_str().unwrap_or("").to_string(),
                author: h["author"].as_str().unwrap_or("").to_string(),
                title: h["title"].as_str().unwrap_or("").to_string(),
                summary: h["description"].as_str().unwrap_or("").to_string(),
                icon_url: h["icon_url"].as_str().map(|s| s.to_string()),
                downloads: h["downloads"].as_u64().unwrap_or(0),
                categories: h["categories"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default(),
                updated_at: h["date_modified"].as_str().map(|s| s.to_string()),
                latest_version_label: h["latest_version"].as_str().map(|s| s.to_string()),
                website_url: Some(format!(
                    "https://modrinth.com/plugin/{}",
                    h["slug"].as_str().unwrap_or("")
                )),
                compatible_with_server: if server_version.is_empty() {
                    true
                } else {
                    h["versions"]
                        .as_array()
                        .map(|v| v.iter().any(|ver| ver.as_str() == Some(server_version)))
                        .unwrap_or(false)
                },
            })
            .collect())
    }

    async fn install_modrinth(
        &self,
        request: &PluginInstallRequest,
        server_version: &str,
        plugins_dir: &Path,
    ) -> Result<PluginInstallResult, AppError> {
        let url = if server_version.is_empty() {
            format!("https://api.modrinth.com/v2/project/{}/version?loaders=[\"paper\",\"bukkit\",\"spigot\"]", request.project_id)
        } else {
            format!("https://api.modrinth.com/v2/project/{}/version?loaders=[\"paper\",\"bukkit\",\"spigot\"]&game_versions=[\"{}\"]", request.project_id, server_version)
        };
        let versions: Vec<serde_json::Value> = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await?
            .json()
            .await?;

        let version = versions
            .first()
            .ok_or_else(|| AppError::NotFound("No compatible Modrinth version".into()))?;

        let file = version["files"]
            .as_array()
            .and_then(|f| f.iter().find(|f| f["primary"].as_bool() == Some(true)).or(f.first()))
            .ok_or_else(|| AppError::NotFound("No file in version".into()))?;

        let download_url = file["url"]
            .as_str()
            .ok_or_else(|| AppError::Generic("Missing download URL".into()))?;
        let file_name = file["filename"]
            .as_str()
            .ok_or_else(|| AppError::Generic("Missing filename".into()))?;

        let cache_path = self
            .cache_dir
            .join("plugins")
            .join("modrinth")
            .join(&request.project_id)
            .join(file_name);

        downloads::download_file(&self.http, download_url, &cache_path).await?;

        let dest = plugins_dir.join(file_name);
        tokio::fs::create_dir_all(plugins_dir).await?;
        tokio::fs::copy(&cache_path, &dest).await?;

        Ok(PluginInstallResult {
            provider: PluginProvider::Modrinth,
            plugin_name: request.slug.clone(),
            file_name: file_name.to_string(),
            target_path: dest.to_string_lossy().to_string(),
        })
    }

    async fn browse_modrinth(
        &self,
        sort: &str,
        server_version: &str,
    ) -> Result<Vec<PluginSearchResult>, AppError> {
        let index = match sort {
            "newest" => "newest",
            "updated" => "updated",
            _ => "downloads",
        };
        let facets = if server_version.is_empty() {
            r#"[["all_project_types:plugin"],["server_side:required","server_side:optional"]]"#.to_string()
        } else {
            format!(r#"[["all_project_types:plugin"],["versions:{server_version}"],["server_side:required","server_side:optional"]]"#)
        };
        let url = format!(
            "https://api.modrinth.com/v2/search?index={}&facets={}&limit=20",
            index,
            urlencoded(&facets)
        );
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await?
            .json()
            .await?;

        let hits = resp["hits"].as_array().cloned().unwrap_or_default();
        Ok(hits
            .iter()
            .map(|h| PluginSearchResult {
                provider: PluginProvider::Modrinth,
                project_id: h["project_id"].as_str().unwrap_or("").to_string(),
                slug: h["slug"].as_str().unwrap_or("").to_string(),
                author: h["author"].as_str().unwrap_or("").to_string(),
                title: h["title"].as_str().unwrap_or("").to_string(),
                summary: h["description"].as_str().unwrap_or("").to_string(),
                icon_url: h["icon_url"].as_str().map(|s| s.to_string()),
                downloads: h["downloads"].as_u64().unwrap_or(0),
                categories: h["categories"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default(),
                updated_at: h["date_modified"].as_str().map(|s| s.to_string()),
                latest_version_label: h["latest_version"].as_str().map(|s| s.to_string()),
                website_url: Some(format!(
                    "https://modrinth.com/plugin/{}",
                    h["slug"].as_str().unwrap_or("")
                )),
                compatible_with_server: if server_version.is_empty() {
                    true
                } else {
                    h["versions"]
                        .as_array()
                        .map(|v| v.iter().any(|ver| ver.as_str() == Some(server_version)))
                        .unwrap_or(false)
                },
            })
            .collect())
    }

    async fn browse_hangar(
        &self,
        sort: &str,
        server_version: &str,
    ) -> Result<Vec<PluginSearchResult>, AppError> {
        let sort_param = match sort {
            "newest" => "-newest",
            "updated" => "-updated",
            _ => "-downloads",
        };
        let url = if server_version.is_empty() {
            format!("https://hangar.papermc.io/api/v1/projects?limit=20&sort={}&platform=PAPER", sort_param)
        } else {
            format!("https://hangar.papermc.io/api/v1/projects?limit=20&sort={}&platform=PAPER&version={}", sort_param, server_version)
        };
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await?
            .json()
            .await?;

        let results = resp["result"].as_array().cloned().unwrap_or_default();
        Ok(results
            .iter()
            .map(|p| {
                let ns_owner = p["namespace"]["owner"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let ns_slug = p["namespace"]["slug"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                PluginSearchResult {
                    provider: PluginProvider::Hangar,
                    project_id: ns_slug.clone(),
                    slug: ns_slug.clone(),
                    author: ns_owner.clone(),
                    title: p["name"].as_str().unwrap_or("").to_string(),
                    summary: p["description"].as_str().unwrap_or("").to_string(),
                    icon_url: p["avatarUrl"].as_str().map(|s| s.to_string()),
                    downloads: p["stats"]["downloads"].as_u64().unwrap_or(0),
                    categories: p["category"]
                        .as_str()
                        .map(|c| vec![c.to_string()])
                        .unwrap_or_default(),
                    updated_at: p["lastUpdated"].as_str().map(|s| s.to_string()),
                    latest_version_label: None,
                    website_url: Some(format!("https://hangar.papermc.io/{}/{}", ns_owner, ns_slug)),
                    compatible_with_server: true,
                }
            })
            .collect())
    }

    // CurseForge

    async fn search_curseforge(
        &self,
        query: &str,
        server_version: &str,
    ) -> Result<Vec<PluginSearchResult>, AppError> {
        let api_key = std::env::var("VMC_CURSEFORGE_API_KEY")
            .map_err(|_| AppError::Generic("VMC_CURSEFORGE_API_KEY not set".into()))?;

        let url = format!(
            "https://api.curseforge.com/v1/mods/search?gameId=432&classId=5&searchFilter={}&gameVersion={}&sortField=2&sortOrder=desc&pageSize=20",
            urlencoded(query), server_version
        );
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("x-api-key", &api_key)
            .send()
            .await?
            .json()
            .await?;

        let data = resp["data"].as_array().cloned().unwrap_or_default();
        Ok(data
            .iter()
            .map(|m| {
                let mod_id = m["id"].as_u64().unwrap_or(0);
                PluginSearchResult {
                    provider: PluginProvider::Curseforge,
                    project_id: mod_id.to_string(),
                    slug: m["slug"].as_str().unwrap_or("").to_string(),
                    author: m["authors"]
                        .as_array()
                        .and_then(|a| a.first())
                        .and_then(|a| a["name"].as_str())
                        .unwrap_or("")
                        .to_string(),
                    title: m["name"].as_str().unwrap_or("").to_string(),
                    summary: m["summary"].as_str().unwrap_or("").to_string(),
                    icon_url: m["logo"]["thumbnailUrl"]
                        .as_str()
                        .map(|s| s.to_string()),
                    downloads: m["downloadCount"].as_u64().unwrap_or(0),
                    categories: m["categories"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|c| c["name"].as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default(),
                    updated_at: m["dateModified"].as_str().map(|s| s.to_string()),
                    latest_version_label: m["latestFilesIndexes"]
                        .as_array()
                        .and_then(|a| a.first())
                        .and_then(|f| f["gameVersion"].as_str())
                        .map(|s| s.to_string()),
                    website_url: m["links"]["websiteUrl"]
                        .as_str()
                        .map(|s| s.to_string()),
                    compatible_with_server: m["latestFilesIndexes"]
                        .as_array()
                        .map(|files| {
                            files
                                .iter()
                                .any(|f| f["gameVersion"].as_str() == Some(server_version))
                        })
                        .unwrap_or(false),
                }
            })
            .collect())
    }

    async fn install_curseforge(
        &self,
        request: &PluginInstallRequest,
        server_version: &str,
        plugins_dir: &Path,
    ) -> Result<PluginInstallResult, AppError> {
        let api_key = std::env::var("VMC_CURSEFORGE_API_KEY")
            .map_err(|_| AppError::Generic("VMC_CURSEFORGE_API_KEY not set".into()))?;

        let mod_id: u64 = request
            .project_id
            .parse()
            .map_err(|_| AppError::Generic("Invalid CurseForge mod ID".into()))?;

        let url = format!(
            "https://api.curseforge.com/v1/mods/{mod_id}/files?gameVersion={server_version}&sortField=1&sortOrder=desc&pageSize=1"
        );
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("x-api-key", &api_key)
            .send()
            .await?
            .json()
            .await?;

        let file = resp["data"]
            .as_array()
            .and_then(|a| a.first())
            .ok_or_else(|| AppError::NotFound("No compatible CurseForge file".into()))?;

        let download_url = file["downloadUrl"]
            .as_str()
            .ok_or_else(|| AppError::Generic("Missing download URL".into()))?;
        let file_name = file["fileName"]
            .as_str()
            .ok_or_else(|| AppError::Generic("Missing filename".into()))?;

        let cache_path = self
            .cache_dir
            .join("plugins")
            .join("curseforge")
            .join(&request.project_id)
            .join(file_name);

        downloads::download_file(&self.http, download_url, &cache_path).await?;

        let dest = plugins_dir.join(file_name);
        tokio::fs::create_dir_all(plugins_dir).await?;
        tokio::fs::copy(&cache_path, &dest).await?;

        Ok(PluginInstallResult {
            provider: PluginProvider::Curseforge,
            plugin_name: request.slug.clone(),
            file_name: file_name.to_string(),
            target_path: dest.to_string_lossy().to_string(),
        })
    }

    // Hangar

    async fn search_hangar(
        &self,
        query: &str,
        server_version: &str,
    ) -> Result<Vec<PluginSearchResult>, AppError> {
        let url = if server_version.is_empty() {
            format!("https://hangar.papermc.io/api/v1/projects?q={}&limit=20&platform=PAPER", urlencoded(query))
        } else {
            format!("https://hangar.papermc.io/api/v1/projects?q={}&limit=20&platform=PAPER&version={}", urlencoded(query), server_version)
        };
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await?
            .json()
            .await?;

        let results = resp["result"].as_array().cloned().unwrap_or_default();
        Ok(results
            .iter()
            .map(|p| {
                let ns_owner = p["namespace"]["owner"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let ns_slug = p["namespace"]["slug"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                PluginSearchResult {
                    provider: PluginProvider::Hangar,
                    project_id: ns_slug.clone(),
                    slug: ns_slug.clone(),
                    author: ns_owner,
                    title: p["name"].as_str().unwrap_or("").to_string(),
                    summary: p["description"].as_str().unwrap_or("").to_string(),
                    icon_url: p["avatarUrl"].as_str().map(|s| s.to_string()),
                    downloads: p["stats"]["downloads"].as_u64().unwrap_or(0),
                    categories: p["category"]
                        .as_str()
                        .map(|c| vec![c.to_string()])
                        .unwrap_or_default(),
                    updated_at: p["lastUpdated"].as_str().map(|s| s.to_string()),
                    latest_version_label: None,
                    website_url: Some(format!("https://hangar.papermc.io/{}/{}", p["namespace"]["owner"].as_str().unwrap_or(""), ns_slug)),
                    compatible_with_server: true,
                }
            })
            .collect())
    }

    async fn install_hangar(
        &self,
        request: &PluginInstallRequest,
        server_version: &str,
        plugins_dir: &Path,
    ) -> Result<PluginInstallResult, AppError> {
        let url = if server_version.is_empty() {
            format!("https://hangar.papermc.io/api/v1/projects/{}/{}/versions?limit=1&platform=PAPER", request.author, request.slug)
        } else {
            format!("https://hangar.papermc.io/api/v1/projects/{}/{}/versions?limit=1&platform=PAPER&platformVersion={}", request.author, request.slug, server_version)
        };
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await?
            .json()
            .await?;

        let version = resp["result"]
            .as_array()
            .and_then(|a| a.first())
            .ok_or_else(|| AppError::NotFound("No compatible Hangar version".into()))?;

        let version_name = version["name"]
            .as_str()
            .ok_or_else(|| AppError::Generic("Missing version name".into()))?;

        let download_url = format!(
            "https://hangar.papermc.io/api/v1/projects/{}/{}/versions/{}/PAPER/download",
            request.author, request.slug, version_name
        );

        let file_name = format!("{}-{}.jar", request.slug, version_name);
        let cache_path = self
            .cache_dir
            .join("plugins")
            .join("hangar")
            .join(&request.slug)
            .join(&file_name);

        downloads::download_file(&self.http, &download_url, &cache_path).await?;

        let dest = plugins_dir.join(&file_name);
        tokio::fs::create_dir_all(plugins_dir).await?;
        tokio::fs::copy(&cache_path, &dest).await?;

        Ok(PluginInstallResult {
            provider: PluginProvider::Hangar,
            plugin_name: request.slug.clone(),
            file_name,
            target_path: dest.to_string_lossy().to_string(),
        })
    }

    pub async fn list_versions(
        &self,
        provider: &PluginProvider,
        project_id: &str,
        slug: &str,
        author: &str,
        server_version: &str,
    ) -> Result<Vec<PluginVersionEntry>, AppError> {
        match provider {
            PluginProvider::Modrinth => self.list_versions_modrinth(project_id, server_version).await,
            PluginProvider::Hangar => self.list_versions_hangar(author, slug).await,
            PluginProvider::Curseforge => Err(AppError::Generic("CurseForge version listing not supported".into())),
        }
    }

    async fn list_versions_modrinth(
        &self,
        project_id: &str,
        server_version: &str,
    ) -> Result<Vec<PluginVersionEntry>, AppError> {
        let url = if server_version.is_empty() {
            format!(
                "https://api.modrinth.com/v2/project/{}/version?loaders=[\"paper\",\"bukkit\",\"spigot\"]",
                urlencoded(project_id)
            )
        } else {
            format!(
                "https://api.modrinth.com/v2/project/{}/version?loaders=[\"paper\",\"bukkit\",\"spigot\"]&game_versions=[\"{}\"]",
                urlencoded(project_id),
                server_version
            )
        };
        let versions: Vec<serde_json::Value> = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await?
            .json()
            .await?;

        Ok(versions
            .iter()
            .map(|v| {
                let file = v["files"]
                    .as_array()
                    .and_then(|f| f.iter().find(|f| f["primary"].as_bool() == Some(true)).or(f.first()));
                PluginVersionEntry {
                    version_id: v["id"].as_str().unwrap_or("").to_string(),
                    version_number: v["version_number"].as_str().unwrap_or("").to_string(),
                    name: v["name"].as_str().unwrap_or("").to_string(),
                    version_type: v["version_type"].as_str().unwrap_or("release").to_string(),
                    game_versions: v["game_versions"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default(),
                    loaders: v["loaders"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default(),
                    date_published: v["date_published"].as_str().unwrap_or("").to_string(),
                    downloads: v["downloads"].as_u64().unwrap_or(0),
                    file_url: file.and_then(|f| f["url"].as_str().map(|s| s.to_string())),
                    file_name: file.and_then(|f| f["filename"].as_str().map(|s| s.to_string())),
                    changelog: v["changelog"].as_str().filter(|s| !s.is_empty()).map(|s| s.to_string()),
                }
            })
            .collect())
    }

    async fn list_versions_hangar(
        &self,
        author: &str,
        slug: &str,
    ) -> Result<Vec<PluginVersionEntry>, AppError> {
        let url = format!(
            "https://hangar.papermc.io/api/v1/projects/{}/{}/versions?limit=25&platform=PAPER",
            urlencoded(author),
            urlencoded(slug)
        );
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await?
            .json()
            .await?;

        let results = resp["result"].as_array().cloned().unwrap_or_default();
        Ok(results
            .iter()
            .map(|v| {
                let version_name = v["name"].as_str().unwrap_or("").to_string();
                let download_url = format!(
                    "https://hangar.papermc.io/api/v1/projects/{}/{}/versions/{}/PAPER/download",
                    author, slug, version_name
                );
                let file_name = format!("{}-{}.jar", slug, version_name);
                PluginVersionEntry {
                    version_id: version_name.clone(),
                    version_number: version_name,
                    name: v["description"].as_str().unwrap_or("").to_string(),
                    version_type: v["channel"]["name"].as_str().unwrap_or("Release").to_lowercase(),
                    game_versions: v["platformDependenciesFormatted"]
                        .as_object()
                        .and_then(|o| o.get("PAPER"))
                        .and_then(|a| a.as_array())
                        .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default(),
                    loaders: vec!["paper".to_string()],
                    date_published: v["createdAt"].as_str().unwrap_or("").to_string(),
                    downloads: v["stats"]["totalDownloads"].as_u64().unwrap_or(
                        v["stats"]["downloads"].as_u64().unwrap_or(0),
                    ),
                    file_url: Some(download_url),
                    file_name: Some(file_name),
                    changelog: v["description"].as_str().filter(|s| !s.is_empty()).map(|s| s.to_string()),
                }
            })
            .collect())
    }

    pub async fn install_version(
        &self,
        file_url: &str,
        file_name: &str,
        old_file_name: &str,
        plugins_dir: &Path,
    ) -> Result<String, AppError> {
        let dest = plugins_dir.join(file_name);
        let old_path = plugins_dir.join(old_file_name);

        let cache_path = self.cache_dir.join("plugins").join("versions").join(file_name);
        downloads::download_file(&self.http, file_url, &cache_path).await?;

        if old_path.exists() {
            tokio::fs::remove_file(&old_path).await?;
        }

        tokio::fs::create_dir_all(plugins_dir).await?;
        tokio::fs::copy(&cache_path, &dest).await?;

        Ok(file_name.to_string())
    }

    pub async fn resolve_by_name(
        &self,
        name: &str,
    ) -> Option<ResolvedPluginInfo> {
        if let Some(info) = self.resolve_modrinth(name).await {
            return Some(info);
        }
        self.resolve_hangar(name).await
    }

    async fn resolve_modrinth(&self, name: &str) -> Option<ResolvedPluginInfo> {
        let facets = r#"[["all_project_types:plugin"]]"#;
        let url = format!(
            "https://api.modrinth.com/v2/search?query={}&facets={}&limit=1",
            urlencoded(name),
            urlencoded(facets)
        );
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await
            .ok()?
            .json()
            .await
            .ok()?;

        let hit = resp["hits"].as_array()?.first()?;
        let title = hit["title"].as_str()?;
        if !name_matches(name, title) && !name_matches(name, hit["slug"].as_str().unwrap_or("")) {
            return None;
        }

        // Fetch the latest bukkit/spigot/paper version specifically (not Velocity/BungeeCord/etc.)
        let project_id = hit["project_id"].as_str().unwrap_or("");
        let ver_url = format!(
            "https://api.modrinth.com/v2/project/{}/version?loaders=[\"paper\",\"bukkit\",\"spigot\"]&limit=1",
            project_id
        );
        let (latest_version, latest_file_name) =
            if let Ok(ver_resp) = self
                .http
                .get(&ver_url)
                .header("User-Agent", "OpenVMC/vmc-launcher")
                .send()
                .await
            {
                if let Ok(versions) = ver_resp.json::<Vec<serde_json::Value>>().await {
                    if let Some(v) = versions.first() {
                        let version_number = v["version_number"].as_str().map(|s| s.to_string());
                        let file_name = v["files"]
                            .as_array()
                            .and_then(|f| {
                                f.iter()
                                    .find(|f| f["primary"].as_bool() == Some(true))
                                    .or_else(|| f.first())
                            })
                            .and_then(|f| f["filename"].as_str().map(|s| s.to_string()));
                        (version_number, file_name)
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            };

        Some(ResolvedPluginInfo {
            provider: PluginProvider::Modrinth,
            icon_url: hit["icon_url"].as_str().map(|s| s.to_string()),
            project_url: Some(format!(
                "https://modrinth.com/plugin/{}",
                hit["slug"].as_str().unwrap_or("")
            )),
            description: hit["description"].as_str().map(|s| s.to_string()),
            latest_version,
            latest_file_name,
        })
    }

    async fn resolve_hangar(&self, name: &str) -> Option<ResolvedPluginInfo> {
        let url = format!(
            "https://hangar.papermc.io/api/v1/projects?q={}&limit=1",
            urlencoded(name)
        );
        let resp: serde_json::Value = self
            .http
            .get(&url)
            .header("User-Agent", "OpenVMC/vmc-launcher")
            .send()
            .await
            .ok()?
            .json()
            .await
            .ok()?;

        let project = resp["result"].as_array()?.first()?;
        let project_name = project["name"].as_str()?;
        if !name_matches(name, project_name) {
            return None;
        }

        let ns_owner = project["namespace"]["owner"].as_str().unwrap_or("");
        let ns_slug = project["namespace"]["slug"].as_str().unwrap_or("");
        let latest_version = project["lastRelease"].as_str().map(|s| s.to_string());
        let latest_file_name = latest_version
            .as_deref()
            .map(|v| format!("{}-{}.jar", ns_slug, v));

        Some(ResolvedPluginInfo {
            provider: PluginProvider::Hangar,
            icon_url: project["avatarUrl"].as_str().map(|s| s.to_string()),
            project_url: Some(format!("https://hangar.papermc.io/{}/{}", ns_owner, ns_slug)),
            description: project["description"].as_str().map(|s| s.to_string()),
            latest_version,
            latest_file_name,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPluginInfo {
    pub provider: PluginProvider,
    pub icon_url: Option<String>,
    pub project_url: Option<String>,
    pub description: Option<String>,
    pub latest_version: Option<String>,
    pub latest_file_name: Option<String>,
}

fn name_matches(query: &str, candidate: &str) -> bool {
    let q = query.to_lowercase().replace(['-', '_', ' '], "");
    let c = candidate.to_lowercase().replace(['-', '_', ' '], "");
    if q == c {
        return true;
    }
    // Substring match only when lengths are within ~28% of each other,
    // to prevent "voicechat" (9) matching "simplevoicechat" (15): 9/15 = 0.60 < 0.72
    let short = q.len().min(c.len());
    let long = q.len().max(c.len());
    long > 0 && short as f64 / long as f64 >= 0.72 && (c.contains(&q) || q.contains(&c))
}

fn urlencoded(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "+".to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}
