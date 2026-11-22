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
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={STATUS_TONE[status]} className="mono text-[10.5px]">
        {status}
      </Badge>
      {mitigated && (
        <span title={t("Passed because a policy or application defense blocked an attempt")} className="text-[11px] text-tertiary">
          ★
        </span>
      )}
    </span>
  );
};

const SEV_CLASS: Record<Severity, string> = {
  critical: "bg-error",
  high: "bg-error/70",
  medium: "bg-tertiary",
  low: "bg-info",
  info: "bg-dim",
};
const SEV_TEXT: Record<Severity, string> = {
  critical: "text-error",
  high: "text-error",
  medium: "text-tertiary-text",
  low: "text-neutral",
  info: "text-neutral",
};
/** Severity: a small square marker and the level name. */
export const Severity_ = ({ severity }: { severity: Severity }) => (
  <span className={cn("inline-flex items-center gap-1.5 text-xs capitalize", SEV_TEXT[severity])}>
    <span className={cn("size-2 shrink-0 rounded-[1px]", SEV_CLASS[severity])} aria-hidden />
    {severity}
  </span>
);

export function CategoryName({ id }: { id: string }) {
  const { t } = useI18n();
  return <>{t(titleCase(id))}</>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 py-6 text-xs text-neutral">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t(label)}…
    </div>
  );
}

export const ErrorNote = ({ message }: { message: string }) => (
  <div role="alert" className="flex items-start gap-2 rounded border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
    <span className="break-words">{message}</span>
  </div>
);

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded border border-dashed border-line px-4 py-6 text-center text-xs text-neutral">{children}</div>
);

/** Page title row: title, optional status tag, one line of context and the page actions. */
export const PageHeader = ({ title, subtitle, actions, badge, badgeWarn }: { title: string; subtitle?: string; actions?: React.ReactNode; badge?: string; badgeWarn?: boolean }) => (
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
    <div className="min-w-0 max-w-3xl">
      <div className="flex items-center gap-2">
        <h1 className="text-[17px] font-semibold leading-7 text-ink">{title}</h1>
        {badge && <Badge tone={badgeWarn ? "warn" : "neutral"}>{badge}</Badge>}
      </div>
      {subtitle && <p className="text-[12.5px] leading-snug text-neutral">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-1.5">{actions}</div>}
  </div>
);

/** A row of key figures separated by hairlines. */
export const StatStrip = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("grid grid-flow-col auto-cols-fr divide-x divide-line rounded border border-line bg-panel", className)}>{children}</div>
);

export const Stat = ({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "bad" | "ok" | "amber" }) => (
  <div className="min-w-0 px-3 py-2">
    <div className="truncate text-xs text-neutral">{label}</div>
    <div
      className={cn(
        "mono text-[17px] font-medium leading-6 tabular-nums",
        tone === "bad" && "text-error",
        tone === "ok" && "text-secondary",
        tone === "amber" && "text-tertiary-text",
      )}
    >
      {value}
    </div>
    {hint && <div className="truncate text-[11px] text-dim">{hint}</div>}
  </div>
);

export const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-[18px] items-center rounded-[3px] border border-line bg-surface px-1.5 text-[11px] text-neutral">{children}</span>
);

export function Json({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={cn("mono max-h-64 overflow-auto rounded border border-line-soft bg-surface-low p-2.5 text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-ink/90", className)}>
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export const scoreColor = (score: number) => (score >= 90 ? "bg-secondary" : score >= 60 ? "bg-tertiary" : "bg-error");
export const scoreText = (score: number) => (score >= 90 ? "text-secondary" : score >= 60 ? "text-tertiary-text" : "text-error");

/** Thin horizontal score bar with the number on the right. */
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden bg-surface-high" role="img" aria-label={`score ${score}`}>
        <div className={cn("h-full", scoreColor(score))} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      <span className={cn("mono w-9 text-right text-xs tabular-nums", scoreText(score))}>{score}</span>
    </div>
  );
}

/** One row per category, weakest first. */
export function CategoryBars({ data }: { data: Record<string, { score: number; fail: number; suspicious: number; inconclusive: number }> }) {
  const { t } = useI18n();
  const rows = Object.entries(data).sort((a, b) => a[1].score - b[1].score);
  const th = "border-b border-line px-3 py-1.5 text-left text-xs font-medium text-neutral";
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr>
          <th className={th}>{t("Category")}</th>
          <th className={cn(th, "w-14 text-right")}>{t("Failed")}</th>
          <th className={cn(th, "w-[42%]")}>{t("Score")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([cat, v]) => (
          <tr key={cat} className="border-b border-line-soft last:border-b-0">
            <td className="truncate px-3 py-1" title={cat}>
              <CategoryName id={cat} />
            </td>
            <td className={cn("mono px-3 py-1 text-right text-xs", v.fail ? "text-error" : "text-dim")}>{v.fail}</td>
            <td className="px-3 py-1">
              <ScoreBar score={v.score} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Severity as a marker only, for dense lists. */
export const SevDot = ({ severity }: { severity: Severity }) => (
  <span title={severity} aria-label={severity} className={cn("size-2 shrink-0 rounded-[1px]", SEV_CLASS[severity])} />
);
