import { useEffect, useState } from "react";
import { STORAGE_KEYS } from "../lib/storage";

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEYS.theme);
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      // ignore
    }
    return systemTheme();
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => { setTheme((t) => (t === "dark" ? "light" : "dark")); };

  return { theme, toggleTheme };
}
