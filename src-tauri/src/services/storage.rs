use crate::error::AppError;
use crate::models::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct LauncherPaths {
    pub root_dir: PathBuf,
    pub state_file: PathBuf,
    pub servers_dir: PathBuf,
    pub runtimes_dir: PathBuf,
    pub cache_dir: PathBuf,
}

impl LauncherPaths {
    pub fn from_app_data(app_data: &Path) -> Self {
        let root = app_data.join("launcher");
        Self {
            state_file: root.join("state.json"),
            servers_dir: root.join("servers"),
            runtimes_dir: root.join("runtimes"),
            cache_dir: root.join("cache"),
            root_dir: root,
        }
    }

    pub fn ensure_dirs(&self) -> Result<(), AppError> {
        for dir in [&self.root_dir, &self.servers_dir, &self.runtimes_dir, &self.cache_dir] {
            std::fs::create_dir_all(dir)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedServerRecord {
    #[serde(flatten)]
    pub record: ServerRecord,
    pub paper_port: u16,
    pub velocity_port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedState {
    pub servers: Vec<PersistedServerRecord>,
    pub active_server_id: Option<String>,
    #[serde(default)]
    pub settings: LauncherSettings,
}

pub struct LauncherStateStore {
    pub paths: LauncherPaths,
    pub state: PersistedState,
}

impl LauncherStateStore {
    pub fn load(paths: LauncherPaths) -> Result<Self, AppError> {
        paths.ensure_dirs()?;
        let state = if paths.state_file.exists() {
            let data = std::fs::read_to_string(&paths.state_file)?;
            serde_json::from_str(&data)?
        } else {
            PersistedState::default()
        };
        Ok(Self { paths, state })
    }

    pub fn save(&self) -> Result<(), AppError> {
        let data = serde_json::to_string_pretty(&self.state)?;
        std::fs::write(&self.paths.state_file, data)?;
        Ok(())
    }

    pub fn find_server(&self, uuid: &str) -> Option<&PersistedServerRecord> {
        self.state.servers.iter().find(|s| s.record.server_uuid == uuid)
    }

    pub fn find_server_mut(&mut self, uuid: &str) -> Option<&mut PersistedServerRecord> {
        self.state.servers.iter_mut().find(|s| s.record.server_uuid == uuid)
    }

    pub fn add_server(&mut self, record: PersistedServerRecord) -> Result<(), AppError> {
        self.state.servers.push(record);
        self.save()
    }

    pub fn remove_server(&mut self, uuid: &str) -> Result<(), AppError> {
        self.state.servers.retain(|s| s.record.server_uuid != uuid);
        self.save()
    }

    pub fn update_and_save(&mut self) -> Result<(), AppError> {
        self.save()
    }
}

pub fn slugify(name: &str) -> String {
    slug::slugify(name)
}
