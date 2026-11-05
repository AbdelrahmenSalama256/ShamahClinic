"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { siteConfig, siteTheme } from "@/config/site";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "shamah_theme";
const THEME_CHANGE_EVENT = "shamah-theme-change";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getThemeSnapshot = (): Theme => {
  if (
    !siteConfig.enableDarkmoodOption ||
    typeof window === "undefined" ||
    window.localStorage.getItem(THEME_STORAGE_KEY) !== "dark"
  ) {
    return "light";
  }
  return "dark";
};

const getServerThemeSnapshot = (): Theme => "light";

const subscribeToTheme = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  useEffect(() => {
    const root = document.documentElement;
    const colors =
      siteConfig.enableDarkmoodOption && theme === "dark"
        ? siteTheme.dark
        : siteTheme.light;

    Object.entries(colors).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    if (siteConfig.enableDarkmoodOption && theme === "dark") {
      root.dataset.theme = "dark";
    } else {
      delete root.dataset.theme;
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    if (!siteConfig.enableDarkmoodOption) return;
    const nextTheme = getThemeSnapshot() === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
