use serde::{Deserialize, Serialize};

// Launcher Settings

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
    #[serde(default = "default_true")]
    pub stop_servers_on_quit: bool,
    #[serde(default)]
    pub notifications_enabled: bool,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default = "default_true")]
    pub show_tray_icon: bool,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            stop_servers_on_quit: true,
            notifications_enabled: false,
            autostart: false,
            show_tray_icon: true,
        }
    }
}

// Enums

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerKind {
    Vanilla,
    #[serde(rename = "papermc")]
    PaperMc,
    Fabric,
    Forge,
    #[serde(rename = "neoforge")]
    NeoForge,
    Pumpkin,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NetworkMode {
    Public,
    Code,
    Whitelist,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NetworkState {
    Disabled,
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConsoleLevel {
    Info,
    Warn,
    Error,
    Command,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PluginProvider {
    Modrinth,
    Curseforge,
    Hangar,
}

// Server Settings

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Peaceful,
    Easy,
    Normal,
    Hard,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Gamemode {
    Survival,
    Creative,
    Adventure,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSettings {
    pub difficulty: Difficulty,
    pub gamemode: Gamemode,
    pub max_players: u32,
    pub max_tick_time: u64,
    pub max_world_size: u64,
    pub pvp: bool,
    pub spawn_protection: u32,
    pub rate_limit: u32,
    pub view_distance: u32,
    pub simulation_distance: u32,
    pub motd: String,
    #[serde(default)]
    pub level_seed: String,
    #[serde(default)]
    pub hardcore: bool,
    #[serde(default)]
    pub allow_flight: bool,
    #[serde(default)]
    pub white_list: bool,
    #[serde(default)]
    pub player_idle_timeout: u32,
    #[serde(default)]
    pub force_gamemode: bool,
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            difficulty: Difficulty::Easy,
            gamemode: Gamemode::Survival,
            max_players: 20,
            max_tick_time: 60000,
            max_world_size: 29999984,
            pvp: true,
            spawn_protection: 16,
            rate_limit: 0,
            view_distance: 10,
            simulation_distance: 10,
            motd: "An OpenVMC server".to_string(),
            level_seed: String::new(),
            hardcore: false,
            allow_flight: false,
            white_list: false,
            player_idle_timeout: 0,
            force_gamemode: false,
        }
    }
}

// VMC Settings

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VmcSettings {
    pub enabled: bool,
    pub slug: String,
    pub mode: NetworkMode,
    pub whitelist: Vec<String>,
    pub last_access_code: Option<String>,
    pub last_access_code_issued_at: Option<String>,
    pub state: NetworkState,
}

impl Default for VmcSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            slug: String::new(),
            mode: NetworkMode::Public,
            whitelist: Vec::new(),
            last_access_code: None,
            last_access_code_issued_at: None,
            state: NetworkState::Disabled,
        }
    }
}

// Addon Mode

#[derive(Debug, Clone, PartialEq)]
pub enum AddonMode {
    Plugins,
    Mods,
    Unsupported,
}

impl ServerKind {
    pub fn addon_mode(&self) -> AddonMode {
        match self {
            ServerKind::PaperMc => AddonMode::Plugins,
            ServerKind::Fabric | ServerKind::Forge | ServerKind::NeoForge => AddonMode::Mods,
            ServerKind::Pumpkin => AddonMode::Plugins,
            ServerKind::Vanilla => AddonMode::Unsupported,
        }
    }

    pub fn runtime_dir_name(&self) -> &str {
        match self {
            ServerKind::PaperMc => "paper",
            _ => "server",
        }
    }
}

// Server Record

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRecord {
    pub server_uuid: String,
    pub display_name: String,
    pub slug: String,
    pub kind: ServerKind,
    pub version: String,
    pub memory_mb: u32,
    pub cpu_cores: u32,
    pub java_version: u32,
    pub status: ServerStatus,
    pub created_at: String,
    pub updated_at: String,
    pub last_played_at: Option<String>,
    pub root_dir: String,
    pub settings: ServerSettings,
    pub vmc: VmcSettings,
    #[serde(default = "default_true")]
    pub auto_update: bool,
}

fn default_true() -> bool { true }

// Console

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleLine {
    pub id: String,
    pub timestamp: String,
    pub level: ConsoleLevel,
    pub text: String,
}

// Files

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub kind: FileKind,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFileContent {
    pub path: String,
    pub content: String,
    pub modified_at: String,
}

// Stats

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServerStats {
    pub uptime_seconds: u64,
    pub cpu_percent: f64,
    pub cpu_limit_percent: f64,
    pub ram_used_mb: f64,
    pub ram_limit_mb: f64,
    pub storage_mb: f64,
}

// Plugins

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub id: String,
    pub file_name: String,
    pub display_name: String,
    pub path: String,
    pub enabled: bool,
    pub size: u64,
    pub modified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authors: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<PluginProvider>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSearchResult {
    pub provider: PluginProvider,
    pub project_id: String,
    pub slug: String,
    pub author: String,
    pub title: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub categories: Vec<String>,
    pub updated_at: Option<String>,
    pub latest_version_label: Option<String>,
    pub website_url: Option<String>,
    pub compatible_with_server: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSearchRequest {
    pub server_uuid: String,
    pub provider: PluginProvider,
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallRequest {
    pub server_uuid: String,
    pub provider: PluginProvider,
    pub project_id: String,
    pub slug: String,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallResult {
    pub provider: PluginProvider,
    pub plugin_name: String,
    pub file_name: String,
    pub target_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowsePluginsRequest {
    pub server_uuid: String,
    pub provider: PluginProvider,
    pub sort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginVersionEntry {
    pub version_id: String,
    pub version_number: String,
    pub name: String,
    pub version_type: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub date_published: String,
    pub downloads: u64,
    pub file_url: Option<String>,
    pub file_name: Option<String>,
    pub changelog: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPluginVersionRequest {
    pub server_uuid: String,
    pub provider: PluginProvider,
    pub project_id: String,
    pub slug: String,
    pub author: String,
    pub version_id: String,
    pub file_url: String,
    pub file_name: String,
    pub old_file_name: String,
}

// Pumpkin Market

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PumpkinMarketPlugin {
    pub id: u64,
    pub name: String,
    #[serde(rename = "type")]
    pub plugin_type: String,
    pub price_cents: u64,
    pub price: f64,
    pub sale_active: bool,
    pub sale_discount_percent: u64,
    pub downloads: u64,
    pub category: String,
    pub preview_path: Option<String>,
    pub translated_descriptions: std::collections::HashMap<String, String>,
    pub dev_name: String,
    pub screenshots: Vec<String>,
    pub is_early_access: bool,
    pub is_preorder: bool,
    pub preorder_release_date: Option<String>,
    pub version: String,
    pub status: String,
}

// Catalog

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCatalogVersionEntry {
    pub version: String,
    pub download_url: String,
    pub java_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCatalogEntry {
    pub kind: ServerKind,
    pub label: String,
    pub subtitle: String,
    pub versions: Vec<ServerCatalogVersionEntry>,
}

// Composites

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSnapshot {
    pub active_server_id: Option<String>,
    pub servers: Vec<ServerRecord>,
    pub catalog: Vec<ServerCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerDetails {
    pub server: ServerRecord,
    pub stats: ServerStats,
    pub console_lines: Vec<ConsoleLine>,
    pub plugins: Vec<InstalledPlugin>,
    pub paper_port: u16,
    pub local_ip: String,
}

// Payloads

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateServerPayload {
    pub display_name: String,
    pub kind: ServerKind,
    pub version: String,
    pub memory_mb: u32,
    pub cpu_cores: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateServerSettingsPayload {
    pub server_uuid: String,
    pub settings: ServerSettings,
}

// Installation Progress

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationProgress {
    pub server_uuid: Option<String>,
    pub stage: String,
    pub detail: String,
    pub current_step: u32,
    pub total_steps: u32,
    pub percent: u32,
    pub done: bool,
}

// Events

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub server_uuid: Option<String>,
    pub progress: Option<InstallationProgress>,
    pub console_line: Option<ConsoleLine>,
}
