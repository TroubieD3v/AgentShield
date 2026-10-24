import { useI18n } from "@/lib/i18n";
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

export const StatusBadge = ({ status, mitigated }: { status: Status; mitigated?: boolean }) => {
  const { t } = useI18n();
  return ((
  <span className="inline-flex items-center gap-1.5">
    <Badge tone={STATUS_TONE[status]}>{status}</Badge>
    {mitigated && (
      <span title={t("Passed because a policy or application defense blocked an attempt")} className="text-xs font-bold text-tertiary">
        ★
      </span>
    )}
  </span>
));
};

const SEV_CLASS: Record<Severity, string> = {
  critical: "text-error",
  high: "text-error/85",
  medium: "text-tertiary-text",
  low: "text-neutral",
  info: "text-neutral",
};
export const Severity_ = ({ severity }: { severity: Severity }) => (
  <span className={cn("text-[11px] font-extrabold uppercase tracking-widest", SEV_CLASS[severity])}>{severity}</span>
);

export function CategoryName({ id }: { id: string }) {
  const { t } = useI18n();
  return <>{t(titleCase(id))}</>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 py-10 text-neutral">
      <Loader2 className="h-4 w-4 animate-spin" /> {t(label)}…
    </div>
  );
}

export const ErrorNote = ({ message }: { message: string }) => (
  <div role="alert" className="flex items-start gap-2 rounded-xl bg-error/10 px-4 py-3 text-sm font-medium text-error">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <span className="break-words">{message}</span>
  </div>
);

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl bg-surface-low px-6 py-10 text-center text-neutral">{children}</div>
);

/** Editorial header: status pill, large light headline, lead paragraph, actions. */
export const PageHeader = ({ title, subtitle, actions, badge, badgeWarn }: { title: string; subtitle?: string; actions?: React.ReactNode; badge?: string; badgeWarn?: boolean }) => (
  <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div className="max-w-2xl">
      {badge && <span className={cn("mb-3 inline-block rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest", badgeWarn ? "bg-tertiary text-on-tertiary" : "bg-pill text-on-pill")}>{badge}</span>}
      <h1 className="font-headline text-[40px] font-semibold leading-none tracking-tighter text-ink md:text-5xl">{title}</h1>
      {subtitle && <p className="mt-4 text-[16px] font-light leading-relaxed text-neutral">{subtitle}</p>}
    </div>
    <div className="flex items-center gap-2">{actions}</div>
  </div>
);

export const Stat = ({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "bad" | "ok" | "amber" }) => (
  <div className="rounded-xl bg-surface-low px-5 py-4">
    <div className="text-[11px] font-bold uppercase tracking-widest text-neutral">{label}</div>
    <div
      className={cn(
        "mt-1.5 font-headline text-3xl font-semibold tabular-nums tracking-tight",
        tone === "bad" && "text-error",
        tone === "ok" && "text-secondary",
        tone === "amber" && "text-tertiary",
      )}
    >
      {value}
    </div>
    {hint && <div className="mt-0.5 text-xs text-neutral">{hint}</div>}
  </div>
);

export const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-neutral">{children}</span>
);

export function Json({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={cn("mono max-h-64 overflow-auto rounded-lg bg-surface-low p-3 text-[12px] leading-relaxed break-words whitespace-pre-wrap text-ink/85", className)}>
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Thin tonal progress bars: one row per category. */
export function CategoryBars({ data }: { data: Record<string, { score: number; fail: number; suspicious: number; inconclusive: number }> }) {
  const rows = Object.entries(data).sort((a, b) => a[1].score - b[1].score);
  return (
    <div className="space-y-3">
      {rows.map(([cat, v]) => {
        const color = v.score >= 90 ? "bg-secondary" : v.score >= 60 ? "bg-tertiary" : "bg-error";
        return (
          <div key={cat} className="grid grid-cols-[170px_1fr_44px] items-center gap-3 text-[13px]">
            <span className="truncate font-medium text-neutral" title={cat}>
              <CategoryName id={cat} />
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${cat} score ${v.score}`}>
              <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(2, v.score)}%` }} />
            </div>
            <span className="text-right font-headline font-bold tabular-nums">{v.score}</span>
          </div>
        );
      })}
    </div>
  );
}

function arc(r: number, pct: number) {
  const c = 2 * Math.PI * r;
  return { strokeDasharray: c, strokeDashoffset: c * (1 - Math.max(0, Math.min(100, pct)) / 100) };
}

/** The "luminous" dial: outer ring = resilience score, inner ring = conclusive coverage. */
export function LuminousDial({ score, coverage, caption, sub, size = 300 }: { score: number; coverage: number; caption: string; sub?: React.ReactNode; size?: number }) {
  const ring = score >= 90 ? "stroke-secondary" : score >= 60 ? "stroke-tertiary" : "stroke-error";
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Resilience score ${score} of 100, coverage ${Math.round(coverage)} percent`}>
      <div className="absolute inset-0 rounded-full bg-secondary/10 blur-3xl" aria-hidden />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="45" fill="none" className="stroke-surface" strokeWidth="6" />
        <circle cx="50" cy="50" r="45" fill="none" className={ring} strokeWidth="6" strokeLinecap="round" {...arc(45, score)} />
      </svg>
      <svg viewBox="0 0 100 100" className="absolute left-[12.5%] top-[12.5%] h-3/4 w-3/4 -rotate-90">
        <circle cx="50" cy="50" r="45" fill="none" stroke="var(--c-surface-high)" strokeWidth="8" />
        <circle cx="50" cy="50" r="45" fill="none" className="stroke-primary" strokeWidth="8" strokeLinecap="round" {...arc(45, coverage)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-headline font-bold leading-none tracking-tighter tabular-nums" style={{ fontSize: size * 0.2 }}>
          {Math.round(score)}
        </div>
        <div className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral">{caption}</div>
        {sub && <div className="mt-3 flex items-center gap-1.5 font-headline text-lg font-semibold text-ink">{sub}</div>}
      </div>
    </div>
  );
}

export function ScoreRing({ value, size = 120 }: { value: number; size?: number }) {
  const { t } = useI18n();
  const color = value >= 90 ? "stroke-secondary" : value >= 60 ? "stroke-tertiary" : "stroke-error";
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Resilience score ${value} of 100`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" className="stroke-surface" strokeWidth="9" />
        <circle cx="50" cy="50" r="42" fill="none" className={color} strokeWidth="9" strokeLinecap="round" {...arc(42, value)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-headline text-3xl font-bold tabular-nums tracking-tighter">{Math.round(value)}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral">{t("resilience")}</span>
      </div>
    </div>
  );
}
