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
    ? { secondary: "#31d57b", tertiary: "#f5a03a", neutral: "#8a9ab3", grid: "#222d40", panel: "#111721", ink: "#e8eef8", cursor: "#151c27", shadow: "rgba(0,0,0,.6)" }
    : { secondary: "#008542", tertiary: "#d97706", neutral: "#64748b", grid: "#dce9ff", panel: "#ffffff", ink: "#0b1c30", cursor: "#eff4ff", shadow: "rgba(11,28,48,.25)" };
}
