import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, titleCase } from "@/lib/utils";
import type { Severity, Status } from "@/lib/types";

const STATUS_TONE: Record<Status, "ok" | "bad" | "warn" | "neutral"> = {
  PASS: "ok",
  FAIL: "bad",
  SUSPICIOUS: "warn",
  INCONCLUSIVE: "neutral",
  ERROR: "neutral",
};

export const StatusBadge = ({ status, mitigated }: { status: Status; mitigated?: boolean }) => (
  <span className="inline-flex items-center gap-1.5">
    <Badge tone={STATUS_TONE[status]}>{status}</Badge>
    {mitigated && (
      <span title="Passed because a policy or application defense blocked an attempt" className="text-xs text-amber">
        ★
      </span>
    )}
  </span>
);

const SEV_CLASS: Record<Severity, string> = {
  critical: "text-[#ff8a8a]",
  high: "text-bad",
  medium: "text-warn",
  low: "text-muted",
  info: "text-muted",
};
export const Severity_ = ({ severity }: { severity: Severity }) => (
  <span className={cn("text-xs font-semibold uppercase tracking-wide", SEV_CLASS[severity])}>{severity}</span>
);

export const CategoryName = ({ id }: { id: string }) => <>{titleCase(id)}</>;

export const Loading = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center gap-2 py-10 text-muted">
    <Loader2 className="h-4 w-4 animate-spin" /> {label}…
  </div>
);

export const ErrorNote = ({ message }: { message: string }) => (
  <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#5a2626] bg-[#2b1414] px-4 py-3 text-sm text-bad">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <span className="break-words">{message}</span>
  </div>
);

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-muted">{children}</div>
);

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
    </div>
    <div className="flex items-center gap-2">{actions}</div>
  </div>
);

export const Stat = ({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "bad" | "ok" | "amber" }) => (
  <div className="rounded-2xl border border-line bg-panel px-5 py-4">
    <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
    <div className={cn("mt-1 text-3xl font-semibold tabular-nums", tone === "bad" && "text-bad", tone === "ok" && "text-ok", tone === "amber" && "text-amber")}>
      {value}
    </div>
    {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
  </div>
);

export const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md border border-line bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted">{children}</span>
);

export function Json({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={cn("mono max-h-64 overflow-auto rounded-lg bg-bg p-3 text-[12px] leading-relaxed break-words whitespace-pre-wrap text-[#c9ced6]", className)}>
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Horizontal score bars: one row per category. */
export function CategoryBars({ data }: { data: Record<string, { score: number; fail: number; suspicious: number; inconclusive: number }> }) {
  const rows = Object.entries(data).sort((a, b) => a[1].score - b[1].score);
  return (
    <div className="space-y-2.5">
      {rows.map(([cat, v]) => {
        const color = v.score >= 90 ? "bg-ok" : v.score >= 60 ? "bg-warn" : "bg-bad";
        return (
          <div key={cat} className="grid grid-cols-[170px_1fr_44px] items-center gap-3 text-[13px]">
            <span className="truncate text-muted" title={cat}>
              <CategoryName id={cat} />
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${cat} score ${v.score}`}>
              <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(2, v.score)}%` }} />
            </div>
            <span className="text-right tabular-nums">{v.score}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ScoreRing({ value, size = 120 }: { value: number; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 90 ? "#5fd39a" : value >= 60 ? "#f0b24a" : "#ef6b6b";
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Resilience score ${value} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#232830" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums">{Math.round(value)}</span>
        <span className="text-[11px] uppercase tracking-wide text-muted">resilience</span>
      </div>
    </div>
  );
}
