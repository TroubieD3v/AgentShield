import { NavLink, Outlet } from "react-router-dom";
import { BookText, Crosshair, FlaskConical, Gauge, Network, PlayCircle, ScrollText, ShieldAlert, Target } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getToken, setToken } from "@/lib/api";

const NAV = [
  { to: "/", label: "Dashboard", icon: Gauge, end: true },
  { to: "/targets", label: "Targets & Models", icon: Target },
  { to: "/scenarios", label: "Scenario Library", icon: BookText },
  { to: "/playground", label: "Attack Playground", icon: Crosshair },
  { to: "/runs", label: "Test Runs", icon: PlayCircle },
  { to: "/traces", label: "Trace Explorer", icon: Network },
  { to: "/findings", label: "Findings", icon: ShieldAlert },
  { to: "/policies", label: "Policies & Reports", icon: ScrollText },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <path d="M16 4 6 8v7.4c0 5.6 4 10 10 12.6 6-2.600 10-7 10-12.600V8L16 4Z" fill="none" stroke="#e8a33d" strokeWidth="2" strokeLinejoin="round" />
        <path d="m11.500 15.500 3.200 3.200 6-6.500" fill="none" stroke="#7cc4e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">AgentShield</div>
        <div className="text-[11px] text-muted">AI Security Assessment Console</div>
      </div>
    </div>
  );
}

export function Layout({ version }: { version?: string }) {
  const [token, setTok] = useState(getToken());
  return (
    <div className="grid min-h-full grid-cols-[236px_1fr]">
      <aside className="sticky top-0 flex h-screen flex-col border-r border-line bg-panel px-3 py-5">
        <div className="px-2 pb-6">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                  isActive ? "bg-[#1d222a] text-ink" : "text-muted hover:bg-panel-2 hover:text-ink",
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line px-2 pt-4 text-[11px] text-muted">
          <div className="flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5 text-amber" /> Mock tools only. No real emails or actions.
          </div>
          <input
            aria-label="API token"
            type="password"
            placeholder="API token (if required)"
            value={token}
            onChange={(e) => {
              setTok(e.target.value);
              setToken(e.target.value);
            }}
            className="h-7 w-full rounded-md border border-line bg-bg px-2 text-[11px] focus:border-sky focus:outline-none"
          />
          <div>v{version ?? "…"}</div>
        </div>
      </aside>
      <main className="min-w-0 px-8 py-7">
        <div className="mx-auto max-w-[1180px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
