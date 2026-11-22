import { useI18n } from "@/lib/i18n";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BookText, ChevronRight, Crosshair, FlaskConical, Gauge, Moon, Network, PlayCircle, ScrollText, ShieldAlert, Sun, Target } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getToken, setToken } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const NAV = [
  { to: "/", label: "Dashboard", short: "Dashboard", icon: Gauge, end: true, group: "Overview" },
  { to: "/targets", label: "Targets & Models", short: "Targets", icon: Target, group: "Setup" },
  { to: "/scenarios", label: "Scenario Library", short: "Scenarios", icon: BookText, group: "Setup" },
  { to: "/policies", label: "Policies & Reports", short: "Policies", icon: ScrollText, group: "Setup" },
  { to: "/playground", label: "Attack Playground", short: "Playground", icon: Crosshair, group: "Testing" },
  { to: "/runs", label: "Test Runs", short: "Runs", icon: PlayCircle, group: "Testing" },
  { to: "/traces", label: "Trace Explorer", short: "Traces", icon: Network, group: "Analysis" },
  { to: "/findings", label: "Findings", short: "Findings", icon: ShieldAlert, group: "Analysis" },
];
const GROUPS = ["Overview", "Setup", "Testing", "Analysis"];

export function Logo({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden className="shrink-0 text-ink">
        <path d="M16 3.5 6 7.5v7.400c0 5.600 4 10.200 10 12.800 6-2.600 10-7.200 10-12.800V7.500L16 3.500Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M16 9v13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      {!compact && <span className="text-[13px] font-semibold">{t("AgentShield")}</span>}
    </div>
  );
}

/** Language (EN / RU) and theme (dark / light) switches. Dark is the default. */
export function Switchers({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const seg = "flex h-5 cursor-pointer items-center rounded-[2px] px-1.5 text-[11px] font-medium transition-colors";
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div role="group" aria-label={t("Language")} className="flex rounded-[3px] border border-line bg-bg p-px">
        {(["en", "ru"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            title={l === "en" ? "English" : "Русский"}
            data-testid={`lang-${l}`}
            className={cn(seg, lang === l ? "bg-surface-highest text-ink" : "text-neutral hover:text-ink")}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div role="group" aria-label={t("Theme")} className="flex rounded-[3px] border border-line bg-bg p-px">
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
            className={cn(seg, theme === k ? "bg-surface-highest text-ink" : "text-neutral hover:text-ink")}
          >
            <Icon className="h-3 w-3" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

function Crumbs() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const item = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));
  const rest = pathname.split("/").filter(Boolean).slice(1);
  return (
    <div className="flex min-w-0 items-center gap-1 text-[12.5px] text-neutral">
      <span>{t("local sandbox")}</span>
      <ChevronRight className="h-3 w-3 shrink-0 text-dim" aria-hidden />
      <span className={cn(rest.length ? "" : "text-ink")}>{t(item?.label ?? "Page")}</span>
      {rest.map((r) => (
        <span key={r} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0 text-dim" aria-hidden />
          <span className="mono truncate text-[12px] text-ink">{decodeURIComponent(r)}</span>
        </span>
      ))}
    </div>
  );
}

export function Layout({ version }: { version?: string }) {
  const { t } = useI18n();
  const [token, setTok] = useState(getToken());
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[212px_1fr]">
      <div className="hidden border-r border-line bg-chrome lg:block">
      <aside className="sticky top-0 flex h-screen flex-col">
        <div className="flex h-10 items-center border-b border-line px-3">
          <Logo />
          <span className="mono ml-auto text-[11px] text-dim">v{version ?? "…"}</span>
        </div>
        <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-2" aria-label={t("Main")}>
          {GROUPS.map((g) => (
            <div key={g} className="mb-2">
              <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-dim">{t(g)}</div>
              {NAV.filter((n) => n.group === g).map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex h-7 items-center gap-2 rounded-[3px] px-2 text-[12.5px] transition-colors",
                      isActive ? "bg-surface-high font-medium text-ink" : "text-neutral hover:bg-surface hover:text-ink",
                    )
                  }
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t(label)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-3 text-[11px] text-neutral">
          <div className="flex items-start gap-1.5 leading-snug">
            <FlaskConical className="mt-px h-3 w-3 shrink-0 text-tertiary" /> {t("Mock tools only. No real emails or actions leave this machine.")}
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
            className="h-6 w-full rounded-[3px] border border-line bg-bg px-2 text-[11px] placeholder:text-dim focus:border-accent focus:outline-none"
          />
          <Switchers />
        </div>
      </aside>
      </div>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-10 items-center justify-between gap-3 border-b border-line bg-bg px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="lg:hidden">
              <Logo compact />
            </span>
            <Crumbs />
          </div>
          <Switchers className="lg:hidden" />
        </header>
        <main className="px-4 pb-24 pt-4 lg:px-5 lg:pb-8">
          <div className="mx-auto max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-chrome lg:hidden" aria-label={t("Main (mobile)")}>
        <div className="no-scrollbar flex gap-0.5 overflow-x-auto px-2 py-1">
          {NAV.map(({ to, short, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn("flex min-w-[64px] flex-col items-center gap-0.5 rounded-[3px] px-2 py-1", isActive ? "bg-surface-high text-ink" : "text-neutral")}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="text-[10.5px]">{t(short)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
