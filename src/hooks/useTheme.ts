import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "auto";
const THEME_KEY = "vmc-launcher-theme";

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem(THEME_KEY) as ThemeMode) || "dark";
  });

  const setTheme = useCallback((t: ThemeMode) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  }, []);

  useEffect(() => {
    const resolve = (mode: ThemeMode) =>
      mode === "auto"
        ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
        : mode;

    document.documentElement.setAttribute("data-theme", resolve(theme));

    if (theme === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => document.documentElement.setAttribute("data-theme", resolve("auto"));
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  return { theme, setTheme };
}
