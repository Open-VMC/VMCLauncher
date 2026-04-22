import type { Translations } from "../types";

const fr: Translations = {
  // General
  appName: "VMC Launcher",
  loading: "Chargement…",
  save: "Sauvegarder",
  cancel: "Annuler",
  create: "Créer",
  search: "Rechercher",
  close: "Fermer",
  yes: "Oui",
  no: "Non",
  soon: "bientôt",
  open: "Ouvrir",
  launch: "Lancer",
  stop: "Arrêter",
  new: "Nouveau",
  error: "Une erreur est survenue.",

  auth: {
    login: "Connexion",
    register: "Créer un compte",
    email: "Email",
    emailPlaceholder: "mail@exemple.com",
    password: "Mot de passe",
    passwordPlaceholder: "••••••••",
    displayName: "Pseudo OpenVMC",
    displayNamePlaceholder: "LeDavax",
    loginCta: "Se connecter",
    registerCta: "Créer mon compte",
    busy: "Patiente…",
    heroTitle: "Ton panel local pour Paper et Paper + VMC",
    heroSubtitle:
      "Gere tes serveurs, telecharge les builds stables Paper officielles, et connecte un serveur au VMC Network sans quitter l'app.",
    deviceLabel: "Appareil",
    deviceNote:
      "Un compte gratuit ne peut etre connecte simultanement que sur un seul appareil.",
  },

  nav: {
    home: "Accueil",
    editor: "Éditeur",
    servers: "Serveurs",
    settings: "Paramètres",
  },

  home: {
    heroTagline: "Build, lance et route tes serveurs Paper via VMC Network.",
    myServers: "Mes serveurs",
    emptyHint: "Commence par créer ton premier serveur.",
    activeHint: "Lance ou ouvre un serveur local.",
    newServer: "Nouveau serveur",
  },

  servers: {
    title: "Mes serveurs",
    subtitle: "Paper et Paper + VMC, ranges dans des dossiers geres par l'app.",
  },

  status: {
    stopped: "Hors ligne",
    starting: "Démarrage",
    running: "En ligne",
    stopping: "Arrêt",
    error: "Erreur",
  },

  serverNav: {
    console: "Console",
    files: "Fichiers",
    plugins: "Plugins",
    mods: "Mods",
    serverSettings: "Réglages",
    vmcSettings: "Parametres VMC",
  },

  stats: {
    uptime: "Uptime",
    cpu: "CPU",
    ram: "RAM",
    storage: "Stockage",
    vmcNetwork: "VMC Network",
    connected: "Connecté",
    offline: "Hors ligne",
  },

  console: {
    commandPlaceholder: "Commande serveur…",
  },

  files: {
    title: "Fichiers",
    managedFolder: "Dossier géré par l'application",
    noFiles: "Aucun fichier texte trouvé.",
    noSelection: "Aucun fichier selectionne",
    unsavedChanges: "Des modifications ne sont pas sauvegardees. Changer de fichier ?",
    unsavedBadge: "Modifications non sauvegardees",
    savedBadge: "A jour",
    saving: "Sauvegarde...",
    loadingFile: "Chargement du fichier...",
    editorPlaceholder: "Selectionne un fichier a gauche pour l'ouvrir.",
  },

  plugins: {
    title: "Plugins",
    searchPlaceholder: "Rechercher un plugin…",
    searchBtn: "Rechercher",
    recommended: "Recommandés",
    folderNotice: "Dossier local",
    installedTitle: "Installés",
    installedEmpty: "Aucun plugin détecté dans le dossier local.",
    sourceLabel: "Source",
    searching: "Recherche en cours…",
    noResults: "Aucun plugin trouvé pour cette recherche.",
    install: "Installer",
    installing: "Installation…",
    compatible: "Compatible",
    incompatible: "Compatibilité à vérifier",
    installSuccess: "Plugin installé dans le dossier local.",
    curseForgeKeyHint: "CurseForge demande une clé API via la variable d'environnement VMC_CURSEFORGE_API_KEY.",
    providers: {
      modrinth: "Modrinth",
      curseforge: "CurseForge",
      hangar: "Hangar Paper",
    },
  },

  serverSettings: {
    title: "Réglages serveur",
    subtitle: "Surface v1 pour server.properties et config Paper.",
    motd: "MOTD",
    difficulty: "Difficulté",
    gamemode: "Gamemode",
    maxPlayers: "Joueurs max",
    viewDistance: "View distance",
    simulationDistance: "Simulation distance",
    pvp: "Activer le PvP",
    difficulties: {
      peaceful: "Peaceful",
      easy: "Easy",
      normal: "Normal",
      hard: "Hard",
    },
    gamemodes: {
      survival: "Survie",
      creative: "Créatif",
      adventure: "Aventure",
    },
  },

  vmcSettings: {
    title: "Parametres VMC",
    subtitle: "Slug, visibilite reseau et whitelist pseudo Minecraft.",
    notEnabled: "Ce serveur n'utilise pas VMC Network.",
    slug: "Slug",
    networkMode: "Mode réseau",
    currentCode: "Code actuel",
    whitelist: "Whitelist pseudos",
    whitelistPlaceholder: "Steve, Alex",
    modes: {
      public: "Public",
      code: "Avec code",
      whitelist: "Whitelist",
    },
  },

  createServer: {
    title: "Nouveau serveur",
    subtitle: "Choisis le type, la version et la memoire avant la creation du dossier local.",
    name: "Nom du serveur",
    namePlaceholder: "SMP amis vanilla",
    type: "Type",
    version: "Version Paper",
    memory: "Mémoire allouée (MiB)",
    visibility: "Visibilite VMC Network",
    cta: "Créer le serveur",
  },

  settingsPage: {
    title: "Paramètres",
    subtitle: "Preferences generales du launcher et etat de la session OpenVMC.",
    general: "Général",
    account: "Compte",
    about: "À propos",
    language: "Langue",
    javaRuntime: "Runtime Java",
    javaRuntimeValue: "Temurin 21 gere automatiquement",
    concurrentServers: "Serveurs simultanés",
    concurrentServersValue: "1 en v1",
    email: "Email",
    plan: "Plan",
    linkedDevice: "Appareil lié",
    deviceNote: "Un compte gratuit ne peut etre connecte simultanement que sur un seul appareil.",
    serverLimit: "Quota serveurs",
    logout: "Deconnecter le compte",
    aboutText:
      "VMC Launcher pilote les serveurs locaux de l'utilisateur, telecharge les jars Paper/Velocity officiels et gere les comptes OpenVMC sur l'appareil.",
  },

  emptyState: {
    title: "Aucun serveur local",
    subtitle:
      "Cree un serveur Paper ou Paper + VMC et le launcher generera son dossier gere automatiquement.",
    cta: "Créer mon premier serveur",
  },
};

export default fr;
