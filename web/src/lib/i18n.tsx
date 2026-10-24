import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { RU } from "./ru";

export type Lang = "en" | "ru";
const KEY = "agentshield.lang";

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate an English UI string. Unknown strings fall back to English. `{name}` placeholders are interpolated. */
  t: (en: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n>({ lang: "en", setLang: () => {}, t: (s) => s });

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "ru") return saved;
  } catch {
    /* storage unavailable */
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const t = useCallback(
    (en: string, vars?: Record<string, string | number>) => {
      let s = lang === "ru" ? (RU[en] ?? en) : en;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
