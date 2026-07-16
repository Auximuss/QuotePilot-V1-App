"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** The resolved theme actually applied — "dark" or "light" */
  resolved: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  setMode: () => {},
  resolved: "dark",
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemPreference(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === "system" ? getSystemPreference() : mode;
  const html = document.documentElement;
  if (resolved === "light") {
    html.classList.add("light");
  } else {
    html.classList.remove("light");
  }
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [resolved, setResolved] = useState<"dark" | "light">("dark");

  // On mount, read the stored preference
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as ThemeMode | null) ?? "dark";
    setModeState(stored);
    setResolved(applyTheme(stored));
  }, []);

  // Listen for OS preference changes when in "system" mode
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    function handleChange() {
      if (mode === "system") {
        setResolved(applyTheme("system"));
      }
    }
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [mode]);

  function setMode(next: ThemeMode) {
    localStorage.setItem("theme", next);
    setModeState(next);
    setResolved(applyTheme(next));
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}
