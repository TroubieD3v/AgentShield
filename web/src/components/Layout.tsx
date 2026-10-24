import { useI18n } from "@/lib/i18n";
import { NavLink, Outlet } from "react-router-dom";
import { BookText, Crosshair, FlaskConical, Gauge, Moon, Network, PlayCircle, ScrollText, ShieldAlert, Sun, Target } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getToken, setToken } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const NAV = [
  { to: "/", label: "Dashboard", short: "Dashboard", icon: Gauge, end: true },
  { to: "/targets", label: "Targets & Models", short: "Targets", icon: Target },
  { to: "/scenarios", label: "Scenario Library", short: "Scenarios", icon: BookText },
  { to: "/playground", label: "Attack Playground", short: "Playground", icon: Crosshair },
  { to: "/runs", label: "Test Runs", short: "Runs", icon: PlayCircle },
  { to: "/traces", label: "Trace Explorer", short: "Traces", icon: Network },
  { to: "/findings", label: "Findings", short: "Findings", icon: ShieldAlert },
  { to: "/policies", label: "Policies & Reports", short: "Policies", icon: ScrollText },
];

export function Logo({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#121212]">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
          <path d="M16 4 6 8v7.400c0 5.600 4 10 10 12.600 6-2.600 10-7 10-12.600V8L16 4Z" fill="none" stroke="#d97706" strokeWidth="2.200" strokeLinejoin="round" />
          <path d="m11.500 15.500 3.200 3.200 6-6.500" fill="none" stroke="#30e375" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-headline text-[19px] font-extrabold tracking-tight">{t("AgentShield")}</div>
          <div className="text-[11px] font-medium text-neutral">{t("AI Security Assessment Console")}</div>
        </div>
      )}
    </div>
  );
}

/** Language (EN / RU) and theme (dark / light) switches. Dark is the default. */
export function Switchers({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const seg = "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-widest transition-all";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div role="group" aria-label={t("Language")} className="flex rounded-full bg-surface p-0.5">
        {(["en", "ru"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            title={l === "en" ? "English" : "Русский"}
            data-testid={`lang-${l}`}
            className={cn(seg, lang === l ? "bg-primary text-on-primary" : "text-neutral hover:text-ink")}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div role="group" aria-label={t("Theme")} className="flex rounded-full bg-surface p-0.5">
        {(
          [
            ["dark", Moon, "Dark"],
            ["light", Sun, "Light"],
          ] as const
        ).map(([k, Icon, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTheme(k)}
            aria-pressed={theme === k}
            aria-label={t(label)}
            title={t(label)}
            data-testid={`theme-${k}`}
            className={cn("flex cursor-pointer items-center rounded-full px-2.5 py-1 transition-all", theme === k ? "bg-primary text-on-primary" : "text-neutral hover:text-ink")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

export function Layout({ version }: { version?: string }) {
  const { t } = useI18n();
  const [token, setTok] = useState(getToken());
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      {/* sidebar (desktop) */}
      <aside className="glass sticky top-0 hidden h-screen flex-col px-4 py-6 lg:flex">
        <div className="px-2 pb-8">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label={t("Main")}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold transition-all",
                  isActive ? "bg-primary text-on-primary shadow-lift" : "text-neutral hover:bg-surface hover:text-ink",
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2.5 px-2 pt-4 text-[11px] text-neutral">
          <Switchers />
          <div className="flex items-start gap-2 rounded-xl bg-surface-low p-3 font-medium leading-snug">
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary" /> {t("Mock tools only. No real emails or actions leave this machine.")}
          </div>
          <input
            aria-label={t("API token")}
            type="password"
            placeholder={t("API token (if required)")}
            value={token}
            onChange={(e) => {
              setTok(e.target.value);
              setToken(e.target.value);
            }}
            className="h-8 w-full rounded-lg border border-line bg-surface-low px-2.5 text-[11px] focus:border-primary focus:outline-none"
          />
          <div className="font-semibold">{t("v")}{version ?? "…"}</div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* top app bar (mobile) */}
        <header className="glass sticky top-0 z-40 flex items-center justify-between px-5 py-3 lg:hidden">
          <Logo compact />
          <Switchers />
        </header>
        <main className="px-5 pb-28 pt-6 lg:px-10 lg:pb-12 lg:pt-10">
          <div className="mx-auto max-w-[1180px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* bottom navigation (mobile) */}
      <nav className="glass fixed inset-x-0 bottom-0 z-50 border-t border-line/60 lg:hidden" aria-label={t("Main (mobile)")}>
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
          {NAV.map(({ to, short, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn("flex min-w-[68px] flex-col items-center gap-1 rounded-xl px-2 py-1.5", isActive ? "text-primary" : "text-neutral")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.6 : 2} aria-hidden />
                  <span className={cn("text-[10px] uppercase tracking-widest", isActive ? "font-extrabold" : "font-medium")}>{t(short)}</span>
                  {isActive && <span className="h-1 w-1 rounded-full bg-primary" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
