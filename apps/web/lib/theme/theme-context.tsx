"use client";

/**
 * Theme switching between the two OpenLobster palettes (dark / light).
 * The initial class is applied by an inline script in the root layout before
 * hydration; this provider reads that value and keeps it in sync with
 * localStorage (a non-sensitive UI preference).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "openlobster.theme";

interface ThemeContextValue {
  readonly theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Preference persistence is best-effort.
    }
  }, [theme]);

  // Follow OS changes only while the user has not chosen explicitly.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    let explicit = false;
    try {
      explicit = window.localStorage.getItem(THEME_STORAGE_KEY) !== null;
    } catch {
      explicit = false;
    }
    if (explicit) return undefined;
    const onChange = (event: MediaQueryListEvent): void => {
      setThemeState(event.matches ? "light" : "dark");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
