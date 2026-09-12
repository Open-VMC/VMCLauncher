import { useState, useEffect, useCallback } from "react";
import { useI18n, LOCALES, type LocaleCode } from "../../i18n";
import type { LauncherSnapshot, LauncherSettings } from "../../types";
import type { ThemeMode } from "../../hooks/useTheme";
import { Select, FormField } from "../ui/Primitives";
import { api } from "../../lib/api";

function SectionTitle({ label }: { label: string }) {
  return (
    <div style={{ gridColumn: "1 / -1", marginTop: 20, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
      <div>
        <div style={{ fontSize: 13, color: "var(--text-soft)" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>}
      </div>
      <button
        type="button"
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
    </div>
  );
}

export function SettingsPage({ snapshot: _snapshot, theme, setTheme, appVersion }: { snapshot: LauncherSnapshot; theme: ThemeMode; setTheme: (t: ThemeMode) => void; appVersion: string | null }) {
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState<LauncherSettings | null>(null);

  useEffect(() => {
    api.getLauncherSettings().then(setSettings).catch(() => {});
  }, []);

  const updateSetting = useCallback((field: keyof LauncherSettings, value: boolean) => {
    setSettings((prev) => prev ? { ...prev, [field]: value } : prev);
    api.updateLauncherSetting(field, value).catch(() => {
      setSettings((prev) => prev ? { ...prev, [field]: !value } : prev);
    });
  }, []);

  return (
    <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>
      <h2 style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 700 }}>{t.settingsPage.title}</h2>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-soft)" }}>{t.settingsPage.subtitle}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", maxWidth: 640 }}>

        <SectionTitle label={t.settingsPage.appearance} />
        <FormField label={t.settingsPage.theme}>
          <Select
            value={theme}
            onChange={(v) => setTheme(v as ThemeMode)}
            options={[
              { value: "dark", label: t.settingsPage.themeDark },
              { value: "light", label: t.settingsPage.themeLight },
              { value: "auto", label: t.settingsPage.themeAuto },
            ]}
          />
        </FormField>
        <FormField label={t.settingsPage.language}>
          <Select
            value={locale}
            onChange={(v) => setLocale(v as LocaleCode)}
            options={Object.entries(LOCALES).map(([code, { label }]) => ({ value: code, label }))}
          />
        </FormField>

        {settings && (
          <>
            <SectionTitle label={t.settingsPage.behavior} />
            <ToggleRow
              label={t.settingsPage.closeToTray}
              hint={t.settingsPage.closeToTrayHint}
              checked={settings.closeToTray}
              onChange={(v) => updateSetting("closeToTray", v)}
            />
            <ToggleRow
              label={t.settingsPage.stopServersOnQuit}
              hint={t.settingsPage.stopServersOnQuitHint}
              checked={settings.stopServersOnQuit}
              onChange={(v) => updateSetting("stopServersOnQuit", v)}
            />
            <ToggleRow
              label={t.settingsPage.notifications}
              hint={t.settingsPage.notificationsHint}
              checked={settings.notificationsEnabled}
              onChange={(v) => {
                if (v && "Notification" in window && Notification.permission === "default") {
                  Notification.requestPermission().then((perm) => {
                    updateSetting("notificationsEnabled", perm === "granted");
                  });
                } else {
                  updateSetting("notificationsEnabled", v);
                }
              }}
            />
            <ToggleRow
              label={t.settingsPage.autostart}
              hint={t.settingsPage.autostartHint}
              checked={settings.autostart}
              onChange={(v) => updateSetting("autostart", v)}
            />
            <ToggleRow
              label={t.settingsPage.showTrayIcon}
              hint={t.settingsPage.showTrayIconHint}
              checked={settings.showTrayIcon}
              onChange={(v) => updateSetting("showTrayIcon", v)}
            />
          </>
        )}

        <SectionTitle label={t.settingsPage.about} />
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{t.settingsPage.appVersion}</span>
          {appVersion && (
            <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--hover-medium)", padding: "2px 8px", borderRadius: 4, fontFamily: "JetBrains Mono, monospace" }}>
              v{appVersion}
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
