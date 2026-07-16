"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { t, LangCode, LANGUAGES, Translations } from "@/lib/i18n";

// ── Context type ──────────────────────────────────────────────────────────────
type LanguageContextValue = {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: Translations;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: t.en,
});

// ── Provider ──────────────────────────────────────────────────────────────────
const LS_KEY = "dp_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem(LS_KEY) as LangCode | null;
    return stored && stored in LANGUAGES ? stored : "en";
  });

  function setLang(l: LangCode) {
    setLangState(l);
    localStorage.setItem(LS_KEY, l);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: t[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTranslation() {
  return useContext(LanguageContext);
}
