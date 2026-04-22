/**
 * i18n system for VMC Launcher
 *
 * ── How to add a new language ────────────────────────────────────────────────
 * 1. Create  src/renderer/src/i18n/locales/<code>.ts
 *    implementing the Translations interface from ./types.ts
 * 2. Import it below and add it to LOCALES with its display label.
 * That's it. The language selector in Settings will pick it up automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Translations } from "./types";
import fr from "./locales/fr";
import en from "./locales/en";

// ── Locale registry ───────────────────────────────────────────────────────────
// To add a language: import its file above and add an entry here.
export const LOCALES: Record<string, { label: string; translations: Translations }> = {
  fr: { label: "Français", translations: fr },
  en: { label: "English", translations: en },
};

export type LocaleCode = keyof typeof LOCALES;

// ── Locale detection ──────────────────────────────────────────────────────────
const STORAGE_KEY = "vmc-launcher-locale";
const FALLBACK: LocaleCode = "en";

function detectLocale(): LocaleCode {
  // 1. User preference stored in localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in LOCALES) return stored as LocaleCode;

  // 2. OS/browser language (e.g. "fr-FR", "fr", "en-US")
  const lang = navigator.language?.split("-")[0]?.toLowerCase();
  if (lang && lang in LOCALES) return lang as LocaleCode;

  // 3. Fallback
  return FALLBACK;
}

// ── Context ───────────────────────────────────────────────────────────────────
interface I18nContextValue {
  locale: LocaleCode;
  t: Translations;
  setLocale: (code: LocaleCode) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(detectLocale);

  const setLocale = useCallback((code: LocaleCode) => {
    if (!(code in LOCALES)) return;
    localStorage.setItem(STORAGE_KEY, code);
    setLocaleState(code);
  }, []);

  // Keep <html lang=""> in sync
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider
      value={{ locale, t: LOCALES[locale].translations, setLocale }}
    >
      {children}
    </I18nContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
