/**
 * Master type for all translation keys.
 * Every locale file MUST implement this interface exactly.
 * To add a new key: add it here first, then fill it in every locale file.
 * To add a new language: create src/renderer/src/i18n/locales/<code>.ts
 *   implementing this interface, then register it in index.ts.
 */
export interface Translations {
  // ── General ──────────────────────────────────────────────────────────────
  appName: string;
  loading: string;
  save: string;
  cancel: string;
  create: string;
  search: string;
  close: string;
  yes: string;
  no: string;
  error: string;
  soon: string;
  open: string;
  launch: string;
  stop: string;
  new: string;

  // ── Auth ─────────────────────────────────────────────────────────────────
  auth: {
    login: string;
    register: string;
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    displayName: string;
    displayNamePlaceholder: string;
    loginCta: string;
    registerCta: string;
    busy: string;
    heroTitle: string;
    heroSubtitle: string;
    deviceLabel: string;
    deviceNote: string;
  };

  // ── Sidebar nav ───────────────────────────────────────────────────────────
  nav: {
    home: string;
    editor: string;
    servers: string;
    settings: string;
  };

  // ── Home page ─────────────────────────────────────────────────────────────
  home: {
    heroTagline: string;
    myServers: string;
    emptyHint: string;
    activeHint: string;
    newServer: string;
  };

  // ── Servers page ──────────────────────────────────────────────────────────
  servers: {
    title: string;
    subtitle: string;
  };

  // ── Server status ─────────────────────────────────────────────────────────
  status: {
    stopped: string;
    starting: string;
    running: string;
    stopping: string;
    error: string;
  };

  // ── Server panel sidebar ──────────────────────────────────────────────────
  serverNav: {
    console: string;
    files: string;
    plugins: string;
    mods: string;
    serverSettings: string;
    vmcSettings: string;
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  stats: {
    uptime: string;
    cpu: string;
    ram: string;
    storage: string;
    vmcNetwork: string;
    connected: string;
    offline: string;
  };

  // ── Console ───────────────────────────────────────────────────────────────
  console: {
    commandPlaceholder: string;
  };

  // ── Files ─────────────────────────────────────────────────────────────────
  files: {
    title: string;
    managedFolder: string;
    noFiles: string;
    noSelection: string;
    unsavedChanges: string;
    unsavedBadge: string;
    savedBadge: string;
    saving: string;
    loadingFile: string;
    editorPlaceholder: string;
    newFile: string;
    createDirectory: string;
    upload: string;
    back: string;
    emptyFolder: string;
    rename: string;
    delete: string;
    deleteServerConfirm: string;
    renameServer: string;
    renameServerHint: string;
    serverName: string;
    rename_action: string;
    saving_action: string;
  };

  // ── Plugins ───────────────────────────────────────────────────────────────
  plugins: {
    title: string;
    searchPlaceholder: string;
    searchBtn: string;
    recommended: string;
    folderNotice: string;
    installedTitle: string;
    installedEmpty: string;
    sourceLabel: string;
    searching: string;
    noResults: string;
    install: string;
    installing: string;
    compatible: string;
    incompatible: string;
    installSuccess: string;
    curseForgeKeyHint: string;
    providers: {
      modrinth: string;
      curseforge: string;
      hangar: string;
    };
  };

  // ── Server settings ───────────────────────────────────────────────────────
  serverSettings: {
    title: string;
    subtitle: string;
    motd: string;
    difficulty: string;
    gamemode: string;
    maxPlayers: string;
    viewDistance: string;
    simulationDistance: string;
    pvp: string;
    difficulties: { peaceful: string; easy: string; normal: string; hard: string };
    gamemodes: { survival: string; creative: string; adventure: string };
  };

  // ── VMC settings ──────────────────────────────────────────────────────────
  vmcSettings: {
    title: string;
    subtitle: string;
    notEnabled: string;
    slug: string;
    networkMode: string;
    currentCode: string;
    whitelist: string;
    whitelistPlaceholder: string;
    modes: { public: string; code: string; whitelist: string };
  };

  // ── Create server dialog ──────────────────────────────────────────────────
  createServer: {
    title: string;
    subtitle: string;
    name: string;
    namePlaceholder: string;
    type: string;
    version: string;
    memory: string;
    visibility: string;
    cta: string;
  };

  // ── Settings page ─────────────────────────────────────────────────────────
  settingsPage: {
    title: string;
    subtitle: string;
    general: string;
    account: string;
    about: string;
    language: string;
    javaRuntime: string;
    javaRuntimeValue: string;
    concurrentServers: string;
    concurrentServersValue: string;
    email: string;
    plan: string;
    linkedDevice: string;
    deviceNote: string;
    serverLimit: string;
    logout: string;
    aboutText: string;
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    title: string;
    subtitle: string;
    cta: string;
  };
}
