import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";
const KEY = "agentshield.theme";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: "dark", setTheme: () => {} });

/** Dark is the default; public/theme.js applies the saved choice before first paint. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

/** SVG presentation attributes cannot use CSS variables, so charts read concrete colors per theme. */
export function useChartColors() {
  const { theme } = useTheme();
  return theme === "dark"
    ? { secondary: "#94b08e", tertiary: "#d0a866", accent: "#8fb4d8", neutral: "#8d939a", grid: "#2f333a", panel: "#1f2226", ink: "#d5d7da", cursor: "#24272c" }
    : { secondary: "#3b6a4a", tertiary: "#87601a", accent: "#3a6693", neutral: "#5b626a", grid: "#cdd3d9", panel: "#f8f9fa", ink: "#1e2227", cursor: "#e6e9ec" };
}
