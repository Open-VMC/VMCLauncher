import { useState, useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import { motion, AnimatePresence } from "framer-motion";
import type { LauncherSnapshot, ServerDetails, ServerSettings } from "../../types";
import { Input, Select, FormField } from "../ui/Primitives";
import { api } from "../../lib/api";

type SwitchStatus = "idle" | "switching" | "success" | "error";

function SectionTitle({ label }: { label: string }) {
  return (
    <div style={{ gridColumn: "1 / -1", marginTop: 8, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
        background: checked ? "var(--green)" : "var(--border)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 8, background: "#fff",
        position: "absolute", top: 3,
        left: checked ? 19 : 3, transition: "left 0.2s",
      }} />
    </button>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", gridColumn: "span 1" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "var(--green)", width: 15, height: 15, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{label}</span>
    </label>
  );
}

export function ServerSettingsView({ details, snapshot }: { details: ServerDetails; snapshot: LauncherSnapshot }) {
  const { t } = useI18n();
  const serverUuid = details.server.serverUuid;
  const isPumpkin = details.server.kind === "pumpkin";
  const [settings, setSettings] = useState(details.server.settings);
  const [autoUpdate, setAutoUpdate] = useState(details.server.autoUpdate);
  const [version, setVersion] = useState(details.server.version);
  const [switchStatus, setSwitchStatus] = useState<SwitchStatus>("idle");
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    setSettings(details.server.settings);
    setAutoUpdate(details.server.autoUpdate);
    setVersion(details.server.version);
    setSwitchStatus("idle");
  }, [serverUuid]);
  useEffect(() => () => { clearTimeout(dismissTimer.current); }, []);

  const pumpkinCatalog = snapshot.catalog.find((c) => c.kind === "pumpkin");

  const versionLabel = (tag: string) => tag === "nightly" ? "beta" : tag;

  const versionOptions = (() => {
    const currentLabel = autoUpdate
      ? `${versionLabel(version)} (auto)`
      : versionLabel(version);
    const opts = [{ value: version, label: currentLabel }];

    for (const v of pumpkinCatalog?.versions ?? []) {
      if (v.version === "latest" || v.version === version) continue;
      opts.push({ value: v.version, label: versionLabel(v.version) });
    }
    return opts;
  })();

  const save = (field: keyof ServerSettings, value: ServerSettings[typeof field]) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    void api.updateServerSetting(serverUuid, field, value);
  };

  return (
    <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>
      <h2 style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 700 }}>{t.serverSettings.title}</h2>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-soft)" }}>{t.serverSettings.subtitle}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", maxWidth: 640 }}>

        <SectionTitle label={t.serverSettings.sectionWorld} />
        <div style={{ gridColumn: "1 / -1" }}>
          <FormField label={t.serverSettings.motd}>
            <Input
              value={settings.motd}
              onChange={(v: string) => setSettings((p) => ({ ...p, motd: v }))}
              onBlur={(v: string) => save("motd", v)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { save("motd", (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
            />
          </FormField>
        </div>
        <FormField label={t.serverSettings.levelSeed}>
          <Input
            value={settings.levelSeed}
            placeholder={t.serverSettings.levelSeedPlaceholder}
            onChange={(v: string) => setSettings((p) => ({ ...p, levelSeed: v }))}
            onBlur={(v: string) => save("levelSeed", v)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { save("levelSeed", (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
          />
        </FormField>
        <div />

        <SectionTitle label={t.serverSettings.sectionGameplay} />
        <FormField label={t.serverSettings.difficulty}>
          <Select value={settings.difficulty} onChange={(v: string) => save("difficulty", v as typeof settings.difficulty)}
            options={(["peaceful", "easy", "normal", "hard"] as const).map((d) => ({ value: d, label: t.serverSettings.difficulties[d] }))} />
        </FormField>
        <FormField label={t.serverSettings.gamemode}>
          <Select value={settings.gamemode} onChange={(v: string) => save("gamemode", v as typeof settings.gamemode)}
            options={(["survival", "creative", "adventure"] as const).map((g) => ({ value: g, label: t.serverSettings.gamemodes[g] }))} />
        </FormField>
        <Checkbox label={t.serverSettings.pvp} checked={settings.pvp} onChange={(v) => save("pvp", v)} />
        <Checkbox label={t.serverSettings.hardcore} checked={settings.hardcore} onChange={(v) => save("hardcore", v)} />
        <Checkbox label={t.serverSettings.allowFlight} checked={settings.allowFlight} onChange={(v) => save("allowFlight", v)} />
        <Checkbox label={t.serverSettings.forceGamemode} checked={settings.forceGamemode} onChange={(v) => save("forceGamemode", v)} />

        <SectionTitle label={t.serverSettings.sectionPlayers} />
        <FormField label={t.serverSettings.maxPlayers}>
          <Input type="number" value={settings.maxPlayers}
            onChange={(v: string) => setSettings((p) => ({ ...p, maxPlayers: Number(v) }))}
            onBlur={(v: string) => save("maxPlayers", Number(v))}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { save("maxPlayers", Number((e.target as HTMLInputElement).value)); (e.target as HTMLInputElement).blur(); } }}
          />
        </FormField>
        <FormField label={t.serverSettings.spawnProtection}>
          <Input type="number" value={settings.spawnProtection}
            onChange={(v: string) => setSettings((p) => ({ ...p, spawnProtection: Number(v) }))}
            onBlur={(v: string) => save("spawnProtection", Number(v))}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { save("spawnProtection", Number((e.target as HTMLInputElement).value)); (e.target as HTMLInputElement).blur(); } }}
          />
        </FormField>
        <FormField label={t.serverSettings.playerIdleTimeout}>
          <Input type="number" value={settings.playerIdleTimeout}
            onChange={(v: string) => setSettings((p) => ({ ...p, playerIdleTimeout: Number(v) }))}
            onBlur={(v: string) => save("playerIdleTimeout", Number(v))}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { save("playerIdleTimeout", Number((e.target as HTMLInputElement).value)); (e.target as HTMLInputElement).blur(); } }}
          />
        </FormField>
        <div />
        <Checkbox label={t.serverSettings.whiteList} checked={settings.whiteList} onChange={(v) => save("whiteList", v)} />

        <SectionTitle label={t.serverSettings.sectionPerf} />
        <FormField label={t.serverSettings.viewDistance}>
          <Input type="number" value={settings.viewDistance}
            onChange={(v: string) => setSettings((p) => ({ ...p, viewDistance: Number(v) }))}
            onBlur={(v: string) => save("viewDistance", Number(v))}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { save("viewDistance", Number((e.target as HTMLInputElement).value)); (e.target as HTMLInputElement).blur(); } }}
          />
        </FormField>
        <FormField label={t.serverSettings.simulationDistance}>
          <Input type="number" value={settings.simulationDistance}
            onChange={(v: string) => setSettings((p) => ({ ...p, simulationDistance: Number(v) }))}
            onBlur={(v: string) => save("simulationDistance", Number(v))}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { save("simulationDistance", Number((e.target as HTMLInputElement).value)); (e.target as HTMLInputElement).blur(); } }}
          />
        </FormField>

        {isPumpkin && (
          <>
            <SectionTitle label={t.serverSettings.sectionPumpkin} />
            <FormField label={t.serverSettings.autoUpdate}>
              <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
                <ToggleSwitch
                  checked={autoUpdate}
                  onChange={(v) => {
                    setAutoUpdate(v);
                    void api.updateServerSetting(serverUuid, "autoUpdate", v);
                  }}
                />
              </div>
            </FormField>
            <FormField label={t.serverSettings.targetVersion}>
              <div style={{ position: "relative" }}>
                <div style={{
                  pointerEvents: switchStatus !== "idle" ? "none" : undefined,
                  filter: switchStatus !== "idle" ? "blur(3px)" : "none",
                  opacity: switchStatus !== "idle" ? 0.4 : 1,
                  transition: "filter 0.3s ease, opacity 0.3s ease",
                }}>
                  <Select
                    dropUp
                    value={version}
                    onChange={(v: string) => {
                      setVersion(v);
                      void api.updateServerSetting(serverUuid, "version", v);
                      if (v !== "latest") {
                        setAutoUpdate(false);
                        void api.updateServerSetting(serverUuid, "autoUpdate", false);
                        if (v !== version) {
                          clearTimeout(dismissTimer.current);
                          setSwitchStatus("switching");
                          void api.switchServerVersion(serverUuid, v)
                            .then(() => {
                              setSwitchStatus("success");
                              dismissTimer.current = setTimeout(() => setSwitchStatus("idle"), 3000);
                            })
                            .catch(() => {
                              setSwitchStatus("error");
                              dismissTimer.current = setTimeout(() => setSwitchStatus("idle"), 5000);
                            });
                        }
                      } else if (!autoUpdate) {
                        setAutoUpdate(true);
                        void api.updateServerSetting(serverUuid, "autoUpdate", true);
                      }
                    }}
                    options={versionOptions}
                  />
                </div>
                <AnimatePresence>
                  {switchStatus !== "idle" && (
                    <motion.div
                      initial={{ opacity: 0, filter: "blur(4px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(4px)" }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        borderRadius: 6,
                        fontSize: 13,
                        color: switchStatus === "success" ? "#2ecc71" : switchStatus === "error" ? "#e74c3c" : "var(--text-soft)",
                      }}
                    >
                      {switchStatus === "switching" && (
                        <motion.svg
                          width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                          style={{ flexShrink: 0 }}
                        >
                          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                        </motion.svg>
                      )}
                      {switchStatus === "success" && (
                        <motion.svg
                          width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}
                          style={{ flexShrink: 0 }}
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </motion.svg>
                      )}
                      {switchStatus === "error" && (
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ flexShrink: 0 }}>
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      )}
                      <span>
                        {switchStatus === "switching" ? t.serverSettings.versionSwitching :
                          switchStatus === "success" ? t.serverSettings.versionSwitchSuccess :
                          t.serverSettings.versionSwitchError}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </FormField>
          </>
        )}

      </div>
    </div>
  );
}
