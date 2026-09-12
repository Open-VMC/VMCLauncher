import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Upload, Download, CheckCircle, Package, Plus, ArrowLeft, RefreshCw, Trash2, X, Search, ChevronRight } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import type { PluginInstallRequest, PluginProvider, PluginSearchRequest, PluginSearchResult, ServerDetails, PumpkinMarketPlugin, InstalledPlugin, ResolvedPluginInfo, PluginVersionEntry } from "../../types";
import { Btn, Select, FormField } from "../ui/Primitives";
import { getAddonMode } from "../../utils/server";

type SortMode = "newest" | "downloads";
type ViewMode = "installed" | "add";

const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } },
};
const listItem = {
  hidden: { opacity: 0, y: 7 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const } },
};

const gridContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
const gridCard = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const } },
};

export function PluginsView({ details, onSearch, onInstall, onReloadDetails }: {
  details: ServerDetails;
  onSearch: (payload: PluginSearchRequest) => Promise<PluginSearchResult[]>;
  onInstall: (payload: PluginInstallRequest) => Promise<void>;
  onReloadDetails: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const uuid = details.server.serverUuid;
  const isPumpkin = details.server.kind === "pumpkin";
  const addonMode = getAddonMode(details.server.kind);
  const isMods = addonMode === "mods";

  const [viewMode, setViewMode] = useState<ViewMode>("installed");
  const [resolvedInfo, setResolvedInfo] = useState<Record<string, ResolvedPluginInfo>>({});

  const [provider, setProvider] = useState<PluginProvider | "market">("modrinth");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [results, setResults] = useState<PluginSearchResult[]>([]);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; isError: boolean } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [marketPlugins, setMarketPlugins] = useState<PumpkinMarketPlugin[]>([]);
  const [marketSearch, setMarketSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("downloads");
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [patchbukkitInstalled, setPatchbukkitInstalled] = useState(false);
  const [installingPB, setInstallingPB] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  const [browseResults, setBrowseResults] = useState<PluginSearchResult[]>([]);
  const [browseSort, setBrowseSort] = useState<"downloads" | "newest" | "updated">("downloads");
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  useEffect(() => { setResults([]); setLocalFeedback(null); }, [provider, uuid]);
  useEffect(() => { if (addonMode !== "plugins" && provider === "hangar") setProvider("modrinth"); }, [addonMode, provider]);

  useEffect(() => {
    details.plugins.forEach((plugin) => {
      const name = plugin.pluginName ?? plugin.displayName;
      if (resolvedInfo[name] !== undefined) return;
      void api.resolvePluginInfo(name).then((info) => {
        if (info) setResolvedInfo((prev) => ({ ...prev, [name]: info }));
      });
    });
  }, [details.plugins]);

  useEffect(() => {
    if (isPumpkin) void api.checkPatchbukkitInstalled(uuid).then(setPatchbukkitInstalled);
  }, [isPumpkin, uuid]);

  useEffect(() => {
    if (!isPumpkin) return;
    const unlistenHover = listen<{ paths: string[] }>("tauri://drag-over", () => setDragOver(true));
    const unlistenLeave = listen("tauri://drag-leave", () => setDragOver(false));
    const unlistenDrop = listen<{ paths: string[] }>("tauri://drag-drop", (e) => {
      setDragOver(false);
      const paths = e.payload.paths.filter((p) => p.endsWith(".wasm") || p.endsWith(".jar"));
      if (paths.length > 0) {
        void api.uploadPluginFiles(uuid, paths).then((count) => {
          setUploadFeedback(`${count} ${t.plugins.vanillaCompat.filesUploaded}`);
          void onReloadDetails();
          setTimeout(() => setUploadFeedback(null), 3000);
        });
      }
    });
    return () => {
      void unlistenHover.then((fn) => fn());
      void unlistenLeave.then((fn) => fn());
      void unlistenDrop.then((fn) => fn());
    };
  }, [isPumpkin, uuid, t, onReloadDetails]);

  const loadMarket = useCallback(async (s: SortMode) => {
    setLoadingMarket(true);
    try {
      const data = await api.searchPumpkinMarket(s);
      setMarketPlugins(data);
    } catch { setMarketPlugins([]); }
    finally { setLoadingMarket(false); }
  }, []);

  useEffect(() => {
    const showMarket = isPumpkin && viewMode === "add" && (!patchbukkitInstalled || provider === "market");
    if (showMarket) void loadMarket(sort);
  }, [isPumpkin, patchbukkitInstalled, sort, loadMarket, viewMode, provider]);

  const loadBrowse = useCallback(async (prov: PluginProvider | "market", s: string) => {
    if (prov === "market") return;
    setLoadingBrowse(true);
    try {
      const data = await api.browsePlugins({ serverUuid: uuid, provider: prov, sort: s });
      setBrowseResults(data);
    } catch { setBrowseResults([]); }
    finally { setLoadingBrowse(false); }
  }, [uuid]);

  useEffect(() => {
    if (viewMode !== "add") return;
    if (isPumpkin && !patchbukkitInstalled) return;
    if (provider === "market") return;
    void loadBrowse(provider, browseSort);
  }, [viewMode, provider, browseSort, isPumpkin, patchbukkitInstalled, loadBrowse]);

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); setLocalFeedback(null); return; }
    if (provider === "market") return;
    setSearching(true); setLocalFeedback(null);
    try {
      if (addonMode === "unsupported") { setLocalFeedback(t.plugins.unsupportedType); setResults([]); return; }
      const nextResults = await onSearch({ serverUuid: uuid, provider: provider, query: trimmed });
      setResults(nextResults);
      if (nextResults.length === 0) setLocalFeedback(isMods ? t.plugins.modsNoResults : t.plugins.noResults);
    } catch (error) {
      setLocalFeedback(error instanceof Error ? error.message : t.error);
    } finally { setSearching(false); }
  }

  function showToast(text: string, isError = false) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, isError });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  async function handleInstall(result: PluginSearchResult) {
    setInstallingId(result.projectId); setLocalFeedback(null);
    try {
      await onInstall({ serverUuid: uuid, provider: result.provider, projectId: result.projectId, slug: result.slug, author: result.author });
      void onReloadDetails();
      showToast(result.title);
    } catch (error) {
      setLocalFeedback(error instanceof Error ? error.message : t.error);
    } finally { setInstallingId(null); }
  }

  async function handleInstallPB() {
    setInstallingPB(true);
    try {
      await api.installPatchbukkit(uuid);
      setPatchbukkitInstalled(true);
    } finally { setInstallingPB(false); }
  }

  async function handleBrowseFiles() {
    await api.uploadServerFiles(uuid, "plugins", undefined, ["wasm", "jar"]);
    void onReloadDetails();
  }

  const providerOptions = [
    ...(isPumpkin && patchbukkitInstalled ? [{ value: "market", label: t.plugins.pumpkinMarket.title }] : []),
    { value: "modrinth", label: t.plugins.providers.modrinth },
    ...(addonMode === "plugins" ? [{ value: "hangar", label: t.plugins.providers.hangar }] : []),
  ];

  const [versionMenuPlugin, setVersionMenuPlugin] = useState<InstalledPlugin | null>(null);

  function pluginRelativePath(plugin: InstalledPlugin): string {
    const isJar = plugin.fileName.endsWith(".jar") || plugin.fileName.endsWith(".jar.disabled");
    if (isPumpkin && isJar) {
      return `plugins/data/patchbukkit/patchbukkit-plugins/${plugin.fileName}`;
    }
    return `plugins/${plugin.fileName}`;
  }

  async function handleDeletePlugin(plugin: InstalledPlugin) {
    if (!window.confirm(t.plugins.deleteConfirm)) return;
    await api.deleteServerFiles(uuid, [pluginRelativePath(plugin)]);
    void onReloadDetails();
  }

  async function handleTogglePlugin(plugin: InstalledPlugin) {
    await api.togglePlugin(uuid, plugin.fileName, !plugin.enabled);
    void onReloadDetails();
  }

  const filteredMarket = marketSearch.trim()
    ? marketPlugins.filter((p) => p.name.toLowerCase().includes(marketSearch.toLowerCase()) || p.devName.toLowerCase().includes(marketSearch.toLowerCase()))
    : marketPlugins;

  const installedSlugs = new Set(
    details.plugins.flatMap((p) => [
      p.pluginName?.toLowerCase(),
      p.displayName?.toLowerCase(),
    ].filter(Boolean) as string[])
  );

  return (
    <>
      <div style={{ position: "relative" }}>
        {/* Vue installés */}
        <div
          style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16, pointerEvents: viewMode === "add" ? "none" : "auto" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{isMods ? t.plugins.modsTitle : t.plugins.title}</h2>
            <Btn variant="primary" onClick={() => setViewMode("add")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} />
              {isMods ? t.plugins.addMod : t.plugins.addPlugin}
            </Btn>
          </div>

          {details.plugins.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.05 }}
              style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-soft)", fontSize: 13 }}
            >
              {isMods ? t.plugins.modsInstalledEmpty : t.plugins.installedEmpty}
            </motion.div>
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 120px", padding: "8px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {isMods ? t.plugins.modsTitle : t.plugins.title}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t.plugins.columnVersion}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>
                  {t.plugins.columnActions}
                </span>
              </div>
              <motion.div variants={listContainer} initial="hidden" animate="show">
                {details.plugins.map((plugin, i) => (
                  <InstalledPluginRow
                    key={plugin.id}
                    plugin={plugin}
                    resolved={resolvedInfo[plugin.pluginName ?? plugin.displayName]}
                    isLast={i === details.plugins.length - 1}
                    onChangeVersion={() => setVersionMenuPlugin(plugin)}
                    onToggle={() => void handleTogglePlugin(plugin)}
                    onDelete={() => void handleDeletePlugin(plugin)}
                  />
                ))}
              </motion.div>
            </div>
          )}
        </div>

        {/* Vue ajout */}
        <AnimatePresence>
          {viewMode === "add" && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, minHeight: "100%", padding: "24px", display: "flex", flexDirection: "column", gap: 20, background: "var(--bg)" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button
                  onClick={() => { setViewMode("installed"); setResults([]); setLocalFeedback(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text-soft)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  <ArrowLeft size={14} />
                  {t.plugins.backToInstalled}
                </button>
                <button
                  onClick={() => void handleBrowseFiles()}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text-soft)", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: dragOver ? "2px solid var(--green-light)" : "none" }}
                >
                  <Upload size={13} />
                  {t.plugins.vanillaCompat.browseFiles}
                </button>
              </div>

              <AnimatePresence>
                {uploadFeedback && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ marginTop: -8, fontSize: 12, color: "var(--green-light)" }}
                  >
                    {uploadFeedback}
                  </motion.div>
                )}
              </AnimatePresence>

              {isPumpkin && !patchbukkitInstalled ? (
                /* Pumpkin sans PatchBukkit → Marketplace + bouton d'activation */
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                    <Package size={14} style={{ color: "var(--text-soft)", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--text-soft)", flex: 1 }}>{t.plugins.vanillaCompat.description}</span>
                    <button
                      onClick={() => void handleInstallPB()}
                      disabled={installingPB}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text-soft)", fontSize: 12, fontWeight: 600, cursor: installingPB ? "not-allowed" : "pointer", opacity: installingPB ? 0.5 : 1, flexShrink: 0 }}
                    >
                      {installingPB ? t.plugins.vanillaCompat.enabling : t.plugins.vanillaCompat.enable}
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <input
                      value={marketSearch}
                      onChange={(e) => setMarketSearch(e.target.value)}
                      placeholder={t.plugins.searchPlaceholder}
                      style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--border-hover)", borderRadius: 6, color: "var(--text)", padding: "8px 12px", outline: "none", fontSize: 13 }}
                    />
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <SortPill active={sort === "downloads"} label={t.plugins.pumpkinMarket.sortDownloads} onClick={() => setSort("downloads")} />
                      <SortPill active={sort === "newest"} label={t.plugins.pumpkinMarket.sortNewest} onClick={() => setSort("newest")} />
                    </div>
                  </div>
                  {loadingMarket ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t.plugins.pumpkinMarket.loading}</div>
                  ) : filteredMarket.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t.plugins.pumpkinMarket.noResults}</div>
                  ) : (
                    <motion.div variants={gridContainer} initial="hidden" animate="show" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                      {filteredMarket.map((plugin) => <MarketCard key={plugin.id} plugin={plugin} />)}
                    </motion.div>
                  )}
                </>
              ) : (
                /* Paper ou Pumpkin+PatchBukkit → UI identique Paper */
                <>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 180 }}>
                      <FormField label={t.plugins.sourceLabel}>
                        <Select value={provider} onChange={(v: string) => { setProvider(v as PluginProvider | "market"); setResults([]); setLocalFeedback(null); }} options={providerOptions} />
                      </FormField>
                    </div>
                    {provider !== "market" && (
                      <>
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSearch(); } }}
                          placeholder={isMods ? t.plugins.modsSearchPlaceholder : t.plugins.searchPlaceholder}
                          style={{ flex: 1, minWidth: 260, background: "var(--bg-input)", border: "1px solid var(--border-hover)", borderRadius: 6, color: "var(--text)", padding: "8px 12px", outline: "none", marginTop: 20, fontSize: 13 }}
                        />
                        <Btn variant="outline" onClick={() => void handleSearch()} disabled={searching} style={{ marginTop: 20 }}>
                          {searching ? t.plugins.searching : t.plugins.searchBtn}
                        </Btn>
                      </>
                    )}
                  </div>

                  {provider === "market" ? (
                    /* Pumpkin Marketplace (quand PatchBukkit activé) */
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <input
                          value={marketSearch}
                          onChange={(e) => setMarketSearch(e.target.value)}
                          placeholder={t.plugins.searchPlaceholder}
                          style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--border-hover)", borderRadius: 6, color: "var(--text)", padding: "8px 12px", outline: "none", fontSize: 13 }}
                        />
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <SortPill active={sort === "downloads"} label={t.plugins.pumpkinMarket.sortDownloads} onClick={() => setSort("downloads")} />
                          <SortPill active={sort === "newest"} label={t.plugins.pumpkinMarket.sortNewest} onClick={() => setSort("newest")} />
                        </div>
                      </div>
                      {loadingMarket ? (
                        <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t.plugins.pumpkinMarket.loading}</div>
                      ) : filteredMarket.length === 0 ? (
                        <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t.plugins.pumpkinMarket.noResults}</div>
                      ) : (
                        <motion.div variants={gridContainer} initial="hidden" animate="show" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                          {filteredMarket.map((p) => <MarketCard key={p.id} plugin={p} />)}
                        </motion.div>
                      )}
                    </>
                  ) : (
                    /* Modrinth / Hangar */
                    <>
                      <AnimatePresence>
                        {localFeedback && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{ marginTop: -8, fontSize: 12, color: (localFeedback === t.plugins.installSuccess || localFeedback === t.plugins.modsInstallSuccess) ? "var(--green-light)" : "#ffb4a8" }}
                          >
                            {localFeedback}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <AnimatePresence mode="wait" initial={false}>
                        {results.length > 0 ? (
                          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                            <PluginGrid results={results} locale={locale} installingId={installingId} onInstall={handleInstall} installedSlugs={installedSlugs} />
                          </motion.div>
                        ) : (
                          <motion.div key="browse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                                {t.plugins.providers[provider]}
                              </span>
                              <div style={{ display: "flex", gap: 6 }}>
                                <SortPill active={browseSort === "downloads"} label={t.plugins.pumpkinMarket.sortDownloads} onClick={() => setBrowseSort("downloads")} />
                                <SortPill active={browseSort === "newest"} label={t.plugins.pumpkinMarket.sortNewest} onClick={() => setBrowseSort("newest")} />
                                <SortPill active={browseSort === "updated"} label={t.plugins.pumpkinMarket.sortUpdated} onClick={() => setBrowseSort("updated")} />
                              </div>
                            </div>
                            {loadingBrowse ? (
                              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t.plugins.pumpkinMarket.loading}</div>
                            ) : (
                              <PluginGrid results={browseResults} locale={locale} installingId={installingId} onInstall={handleInstall} installedSlugs={installedSlugs} />
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {versionMenuPlugin && (
          <VersionMenu
            serverUuid={uuid}
            plugin={versionMenuPlugin}
            resolved={resolvedInfo[versionMenuPlugin.pluginName ?? versionMenuPlugin.displayName]}
            onClose={() => setVersionMenuPlugin(null)}
            onInstalled={() => { setVersionMenuPlugin(null); void onReloadDetails(); }}
          />
        )}
      </AnimatePresence>

      {/* Toast install */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
              background: toast.isError ? "#3a1a1a" : "var(--bg-panel)",
              border: `1px solid ${toast.isError ? "#ff6b6b44" : "var(--border)"}`,
              borderRadius: 8, padding: "10px 18px",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              zIndex: 2000, whiteSpace: "nowrap",
            }}
          >
            <CheckCircle size={15} style={{ color: "var(--green-light)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{toast.text}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.plugins.installedToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function InstalledPluginRow({ plugin, resolved, isLast, onChangeVersion, onToggle, onDelete }: {
  plugin: InstalledPlugin;
  resolved?: ResolvedPluginInfo;
  isLast: boolean;
  onChangeVersion: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const iconUrl = resolved?.iconUrl ?? plugin.iconUrl;
  const description = plugin.description ?? resolved?.description;
  const normalizedFileName = plugin.fileName.replace(/\.disabled$/, "");
  const hasUpdate = !!(resolved?.latestFileName && normalizedFileName !== resolved.latestFileName);

  return (
    <motion.div
      variants={listItem}
      style={{ display: "grid", gridTemplateColumns: "1fr 200px 120px", padding: "10px 16px", alignItems: "center", borderBottom: isLast ? "none" : "1px solid var(--border)", transition: "background 0.1s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-subtle)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {/* Project column */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {iconUrl ? (
          <img src={iconUrl} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", background: "var(--hover-subtle)", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: 6, background: "rgba(76,158,63,0.10)", display: "grid", placeItems: "center", color: "var(--green-light)", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
            {plugin.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-heading)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plugin.displayName}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {description || plugin.fileName}
          </div>
        </div>
      </div>

      {/* Version column */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {plugin.pluginVersion || "-"}
        </div>
        <div style={{ fontSize: 11, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "JetBrains Mono, monospace", color: hasUpdate ? "var(--green-light)" : "var(--text-muted)" }}>
          {hasUpdate ? `→ ${resolved!.latestFileName!.replace(/\.jar$/i, "")}` : plugin.fileName}
        </div>
      </div>

      {/* Actions column */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        {resolved && (
          <button
            onClick={onChangeVersion}
            style={{ background: "none", border: "none", color: hasUpdate ? "var(--green-light)" : "var(--text-muted)", cursor: "pointer", padding: 4, display: "flex", transition: "color 0.15s" }}
            onMouseEnter={(e) => { if (!hasUpdate) (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
            onMouseLeave={(e) => { if (!hasUpdate) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
          >
            {hasUpdate ? <Download size={15} /> : <RefreshCw size={15} />}
          </button>
        )}
        <ToggleSwitch checked={plugin.enabled} onChange={onToggle} />
        <button
          onClick={onDelete}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, display: "flex", transition: "color 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ff8888"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </motion.div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        background: checked ? "var(--green-light)" : "var(--border-hover)",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s ease",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <div style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        background: "#fff",
        position: "absolute",
        top: 2,
        left: checked ? 18 : 2,
        transition: "left 0.2s ease",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

function VersionMenu({ serverUuid, plugin, resolved, onClose, onInstalled }: {
  serverUuid: string;
  plugin: InstalledPlugin;
  resolved?: ResolvedPluginInfo;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const { t, locale } = useI18n();
  const [versions, setVersions] = useState<PluginVersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedFileName2 = plugin.fileName.replace(/\.disabled$/, "");
  const hasUpdate = !!(resolved?.latestFileName && normalizedFileName2 !== resolved.latestFileName);

  useEffect(() => {
    if (!resolved) return;
    setLoading(true);
    const name = plugin.pluginName ?? plugin.displayName;
    void api.listPluginVersions(serverUuid, resolved.provider, name, name, "")
      .then((v) => {
        setVersions(v);
        if (v.length > 0) {
          const pick = hasUpdate
            ? (v.find((e) => e.fileName === resolved.latestFileName) ?? v[0])
            : v[0];
          setSelectedId(pick.versionId);
        }
      })
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [serverUuid, plugin, resolved]);

  useEffect(() => {
    if (latestRef.current) latestRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedId, loading]);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  async function handleInstallVersion(entry: PluginVersionEntry) {
    if (!entry.fileUrl || !entry.fileName || !resolved) return;
    setInstallingId(entry.versionId);
    try {
      await api.installPluginVersion({
        serverUuid,
        provider: resolved.provider,
        projectId: plugin.pluginName ?? plugin.displayName,
        slug: plugin.pluginName ?? plugin.displayName,
        author: "",
        versionId: entry.versionId,
        fileUrl: entry.fileUrl,
        fileName: entry.fileName,
        oldFileName: plugin.fileName,
      });
      onInstalled();
    } catch {
      setInstallingId(null);
    }
  }

  const filtered = search.trim()
    ? versions.filter((v) => v.versionNumber.toLowerCase().includes(search.toLowerCase()))
    : versions;

  const selected = filtered.find((v) => v.versionId === selectedId) ?? null;
  const iconUrl = resolved?.iconUrl ?? plugin.iconUrl;

  return (
    <AnimatePresence>
      <motion.div
        ref={backdropRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
        style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          style={{
            background: "var(--bg-sidebar)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            width: 760,
            height: "75vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "var(--shadow-lg)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {iconUrl ? (
                <img src={iconUrl} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover", background: "var(--hover-subtle)", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(76,158,63,0.10)", display: "grid", placeItems: "center", color: "var(--green-light)", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                  {plugin.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-heading)", lineHeight: 1.2 }}>{plugin.displayName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                    {plugin.pluginVersion || "-"}
                  </span>
                  {hasUpdate && (
                    <>
                      <ChevronRight size={10} style={{ color: "var(--text-muted)" }} />
                      <span style={{ fontSize: 11, color: "var(--green-light)", fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                        {resolved!.latestFileName?.replace(/\.jar$/i, "")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-subtle)"; e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Split pane */}
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

            {/* Left: version list */}
            <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)" }}>
              {/* Search */}
              <div style={{ padding: "12px 12px 8px", flexShrink: 0 }}>
                <div style={{ position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t.plugins.versionSearchPlaceholder}
                    style={{
                      width: "100%", padding: "7px 10px 7px 30px", borderRadius: 6,
                      border: "1px solid var(--border-hover)", background: "var(--bg-input)",
                      color: "var(--text)", fontSize: 12, outline: "none", boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--green)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  />
                </div>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: 32, textAlign: "center" }}>
                    <RefreshCw size={16} style={{ color: "var(--text-muted)", animation: "spin 1s linear infinite", marginBottom: 8 }} />
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.plugins.versionLoading}</div>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>{t.plugins.versionNoResults}</div>
                ) : (
                  filtered.map((v) => {
                    const isCurrent = v.fileName ? plugin.fileName === v.fileName : plugin.pluginVersion === v.versionNumber;
                    const isLatest = hasUpdate && !!(v.fileName && v.fileName === resolved?.latestFileName);
                    const isSelected = selectedId === v.versionId;
                    const isPreRelease = v.versionType === "beta" || v.versionType === "alpha";
                    const typeColor = v.versionType === "beta" ? "#f59e0b" : "#ff8888";
                    const dateStr = v.datePublished
                      ? new Date(v.datePublished).toLocaleDateString(locale, { day: "numeric", month: "short" })
                      : "";

                    return (
                      <div
                        key={v.versionId}
                        ref={isLatest ? latestRef : undefined}
                        onClick={() => setSelectedId(v.versionId)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                          cursor: "pointer", transition: "background 0.1s",
                          background: isSelected ? "var(--hover-medium)" : "transparent",
                          borderLeft: isSelected ? "2px solid var(--green-light)" : "2px solid transparent",
                        }}
                        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--hover-subtle)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isSelected ? "var(--hover-medium)" : "transparent"; }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              fontWeight: 600, fontSize: 12, fontFamily: "JetBrains Mono, monospace",
                              color: isSelected ? "var(--green-light)" : isCurrent ? "var(--green-light)" : "var(--text)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {v.versionNumber}
                            </span>
                            {isCurrent && (
                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, fontWeight: 700, background: "rgba(76,158,63,0.12)", color: "var(--green-light)", flexShrink: 0 }}>
                                {t.plugins.versionCurrent}
                              </span>
                            )}
                            {isPreRelease && (
                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, fontWeight: 600, background: v.versionType === "beta" ? "rgba(245,158,11,0.12)" : "rgba(255,136,136,0.12)", color: typeColor, flexShrink: 0 }}>
                                {v.versionType === "beta" ? t.plugins.versionBeta : t.plugins.versionAlpha}
                              </span>
                            )}
                          </div>
                          {dateStr && (
                            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{dateStr}</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: detail panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
              {selected ? (
                <VersionDetail
                  entry={selected}
                  plugin={plugin}
                  resolved={resolved}
                  hasUpdate={hasUpdate}
                  locale={locale}
                  installingId={installingId}
                  onInstall={handleInstallVersion}
                  t={t}
                />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  {loading ? "" : t.plugins.versionNoResults}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function VersionDetail({ entry, plugin, resolved, hasUpdate, locale, installingId, onInstall, t }: {
  entry: PluginVersionEntry;
  plugin: InstalledPlugin;
  resolved?: ResolvedPluginInfo;
  hasUpdate: boolean;
  locale: string;
  installingId: string | null;
  onInstall: (e: PluginVersionEntry) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const isCurrent = entry.fileName ? plugin.fileName === entry.fileName : plugin.pluginVersion === entry.versionNumber;
  const isLatest = hasUpdate && !!(entry.fileName && entry.fileName === resolved?.latestFileName);
  const isPreRelease = entry.versionType === "beta" || entry.versionType === "alpha";
  const typeColor = entry.versionType === "beta" ? "#f59e0b" : entry.versionType === "alpha" ? "#ff8888" : "var(--green-light)";
  const dateStr = entry.datePublished
    ? new Date(entry.datePublished).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

      {/* Version header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 18, fontFamily: "JetBrains Mono, monospace", color: "var(--text-heading)" }}>
                {entry.versionNumber}
              </span>
              {isCurrent && (
                <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, fontWeight: 700, background: "rgba(76,158,63,0.12)", color: "var(--green-light)" }}>
                  {t.plugins.versionCurrent}
                </span>
              )}
              {isLatest && !isCurrent && (
                <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, fontWeight: 700, background: "rgba(76,158,63,0.12)", color: "var(--green-light)" }}>
                  {t.plugins.versionNew}
                </span>
              )}
              {isPreRelease && (
                <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, fontWeight: 600, background: entry.versionType === "beta" ? "rgba(245,158,11,0.12)" : "rgba(255,136,136,0.12)", color: typeColor }}>
                  {entry.versionType === "beta" ? t.plugins.versionBeta : t.plugins.versionAlpha}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
              {dateStr && <span>{dateStr}</span>}
              {entry.gameVersions.length > 0 && (
                <>
                  {dateStr && <span style={{ opacity: 0.3 }}>·</span>}
                  <span>MC {entry.gameVersions.join(", ")}</span>
                </>
              )}
              {entry.loaders.length > 0 && (
                <>
                  <span style={{ opacity: 0.3 }}>·</span>
                  <span>{entry.loaders.join(", ")}</span>
                </>
              )}
              {entry.downloads > 0 && (
                <>
                  <span style={{ opacity: 0.3 }}>·</span>
                  <span>{entry.downloads.toLocaleString(locale)} {t.plugins.downloadsUnit}</span>
                </>
              )}
            </div>
          </div>

          {!isCurrent && entry.fileUrl && (
            <motion.button
              whileTap={{ y: 1 }}
              onClick={() => void onInstall(entry)}
              disabled={installingId !== null}
              style={{
                padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                flexShrink: 0, whiteSpace: "nowrap", border: "none", transition: "all 0.15s",
                textTransform: "uppercase", letterSpacing: "0.02em",
                background: installingId === entry.versionId ? "rgba(76,158,63,0.15)" : "var(--green)",
                color: installingId === entry.versionId ? "var(--green-light)" : "#fff",
                cursor: installingId !== null ? "not-allowed" : "pointer",
                opacity: installingId !== null && installingId !== entry.versionId ? 0.4 : 1,
                boxShadow: installingId !== entry.versionId ? "0 2px 0 var(--green-hover)" : "none",
              }}
            >
              {installingId === entry.versionId ? t.plugins.versionInstalling : t.plugins.install}
            </motion.button>
          )}
        </div>
      </div>

      {/* Changelog body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {entry.changelog ? (
          <pre style={{
            margin: 0, fontFamily: "inherit", fontSize: 13, color: "var(--text-soft)",
            lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {entry.changelog}
          </pre>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t.plugins.versionChangelog}:
          </div>
        )}
      </div>
    </div>
  );
}

function PluginGrid({ results, locale, installingId, onInstall, installedSlugs }: {
  results: PluginSearchResult[];
  locale: string;
  installingId: string | null;
  onInstall: (result: PluginSearchResult) => void;
  installedSlugs: Set<string>;
}) {
  const { t } = useI18n();
  return (
    <motion.div variants={gridContainer} initial="hidden" animate="show" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
      {results.map((result) => {
        const alreadyInstalled = installedSlugs.has(result.title.toLowerCase()) || installedSlugs.has(result.slug.toLowerCase());
        const isInstalling = installingId === result.projectId;
        return (
          <motion.div key={`${result.provider}:${result.projectId}`} variants={gridCard} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {result.iconUrl ? (
                <img src={result.iconUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", background: "var(--hover-subtle)" }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(76,158,63,0.12)", display: "grid", placeItems: "center", color: "var(--green-light)", fontWeight: 700 }}>
                  {result.title.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--green-light)", fontWeight: 700 }}>{t.plugins.providers[result.provider]}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-heading)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.title}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-soft)", lineHeight: 1.5, minHeight: 54 }}>{result.summary}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 11, background: "rgba(76,158,63,0.12)", color: "var(--green-light)", padding: "2px 8px", borderRadius: 99 }}>
                {result.compatibleWithServer ? t.plugins.compatible : t.plugins.incompatible}
              </span>
              {result.categories.slice(0, 2).map((category) => (
                <span key={category} style={{ fontSize: 11, background: "var(--pill-bg)", color: "var(--text-soft)", padding: "2px 8px", borderRadius: 99 }}>{category}</span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{result.author} · {result.downloads.toLocaleString(locale)} {t.plugins.downloadsUnit}</div>
            <div style={{ marginTop: "auto" }}>
              {alreadyInstalled ? (
                <Btn variant="outline" disabled style={{ width: "100%", justifyContent: "center", opacity: 0.5, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle size={13} />
                  {t.plugins.alreadyInstalled}
                </Btn>
              ) : (
                <Btn variant="primary" onClick={() => void onInstall(result)} disabled={isInstalling} style={{ width: "100%", justifyContent: "center" }}>
                  {isInstalling ? t.plugins.installing : t.plugins.install}
                </Btn>
              )}
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function SortPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 99,
        border: "1px solid var(--border)",
        background: active ? "rgba(76,158,63,0.15)" : "transparent",
        color: active ? "var(--green-light)" : "var(--text-muted)",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""))
    .replace(/[#*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function MarketCard({ plugin }: { plugin: PumpkinMarketPlugin }) {
  const { t, locale } = useI18n();
  const desc = plugin.translatedDescriptions?.["en-US"] ?? "";
  const summary = stripMarkdown(desc.split("\n").find((l) => l.length > 10 && !l.startsWith("#") && !l.startsWith("**Copyright") && !l.startsWith("---")) ?? plugin.name);
  const marketUrl = `https://market.pumpkinmc.org/plugin/${plugin.id}`;

  return (
    <motion.div variants={gridCard} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {plugin.previewPath ? (
          <img src={plugin.previewPath} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", background: "var(--hover-subtle)" }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,149,0,0.12)", display: "grid", placeItems: "center", color: "#ff9500", fontWeight: 700 }}>
            {plugin.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-heading)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{plugin.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.plugins.pumpkinMarket.by} {plugin.devName}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-soft)", lineHeight: 1.5, minHeight: 40, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{summary}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {plugin.category && (
          <span style={{ fontSize: 11, background: "var(--pill-bg)", color: "var(--text-soft)", padding: "2px 8px", borderRadius: 99 }}>{plugin.category}</span>
        )}
        {plugin.price === 0 && (
          <span style={{ fontSize: 11, background: "rgba(76,158,63,0.12)", color: "var(--green-light)", padding: "2px 8px", borderRadius: 99 }}>{t.plugins.pumpkinMarket.free}</span>
        )}
        {plugin.isEarlyAccess && (
          <span style={{ fontSize: 11, background: "rgba(255,149,0,0.12)", color: "#ff9500", padding: "2px 8px", borderRadius: 99 }}>{t.plugins.pumpkinMarket.earlyAccess}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        <Download size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
        {plugin.downloads.toLocaleString(locale)} · v{plugin.version}
      </div>
      <div style={{ marginTop: "auto" }}>
        <button onClick={() => void openUrl(marketUrl)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border-hover)", background: "transparent", color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%", justifyContent: "center", transition: "all 0.15s ease" }}>
          <ExternalLink size={13} />
          {t.plugins.pumpkinMarket.viewOnMarket}
        </button>
      </div>
    </motion.div>
  );
}

