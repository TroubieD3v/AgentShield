import { useI18n } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Download, Flag, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { CategoryBars, Chip, ErrorNote, Loading, PageHeader, Severity_, Stat, StatStrip, StatusBadge } from "@/components/common";
import { ComparisonView } from "@/pages/Runs";
import { api, downloadReport } from "@/lib/api";
import { cn, fmtMs, fmtTime, primaryRepeat, titleCase, useAsync, usePolling } from "@/lib/utils";
import type { CaseResult, Comparison, Status } from "@/lib/types";

const FILTERS: (Status | "ALL")[] = ["ALL", "FAIL", "SUSPICIOUS", "PASS", "INCONCLUSIVE", "ERROR"];

export default function RunDetail() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const run = useAsync(() => api.run(id), [id]);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [open, setOpen] = useState<string | null>(null);
  const [baseline, setBaseline] = useState("main");
  const [note, setNote] = useState<string | null>(null);
  const [reg, setReg] = useState<Comparison | null>(null);

  const running = run.data?.status === "queued" || run.data?.status === "running";
  usePolling(() => void run.reload(), 1000, !!running);

  const cases = useMemo(() => (run.data?.cases ?? []).filter((c) => filter === "ALL" || c.status === filter), [run.data, filter]);

  if (run.loading && !run.data) return <Loading />;
  if (run.error || !run.data) return <ErrorNote message={run.error ?? "Run not found"} />;
  const r = run.data;
  const s = r.summary;

  async function saveBaseline() {
    try {
      await api.setBaseline(baseline, r.id);
      setNote(t("Saved as baseline \"{name}\".", { name: baseline }));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }
  async function check() {
    try {
      setReg(await api.regression(r.id, baseline));
      setNote(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader
        title={r.config.label || r.id}
        subtitle={t("{target} · {variant} · {mode} mode · policy {policy} · {brain} · started {when}", { target: r.config.target, variant: r.config.variant, mode: r.config.mode, policy: r.config.policy, brain: r.config.brain, when: fmtTime(r.started_at) })}
        actions={
          <>
            {["html", "json", "sarif", "md"].map((f) => (
              <Button key={f} size="sm" variant="secondary" onClick={() => downloadReport(r.id, f)} disabled={running} aria-label={`Download ${f} report`}>
                <Download className="h-3 w-3" /> {f.toUpperCase()}
              </Button>
            ))}
          </>
        }
      />
      {running && (
        <div className="mb-3 flex items-center gap-3 rounded border border-line bg-panel px-3 py-2">
          <Badge tone="amber">{r.status}</Badge>
          <div className="h-1.5 flex-1 overflow-hidden bg-surface-high">
            <div className="h-full bg-tertiary transition-all" style={{ width: `${(100 * r.progress.done) / Math.max(1, r.progress.total)}%` }} />
          </div>
          <span className="mono text-xs tabular-nums text-muted">
            {r.progress.done}/{r.progress.total}
          </span>
        </div>
      )}
      {r.error && <ErrorNote message={r.error} />}

      <StatStrip className="overflow-x-auto">
        <Stat label={t("Score")} value={s.score} tone={s.score >= 90 ? "ok" : s.score >= 60 ? "amber" : "bad"} hint={t("resilience")} />
        <Stat label={t("Passed")} value={s.counts.PASS} tone="ok" hint={s.mitigated ? t("{n} only mitigated ★", { n: s.mitigated }) : undefined} />
        <Stat label={t("Failed")} value={s.counts.FAIL} tone={s.counts.FAIL ? "bad" : undefined} />
        <Stat label={t("Suspicious")} value={s.counts.SUSPICIOUS} tone={s.counts.SUSPICIOUS ? "amber" : undefined} hint={t("needs review")} />
        <Stat label={t("Inconclusive")} value={s.counts.INCONCLUSIVE + s.counts.ERROR} hint={t("no telemetry / errors")} />
        <Stat label={t("Violations")} value={`${s.policy_violations_effective}/${s.policy_violations_attempted}`} hint={t("effective / attempted")} />
        <Stat label={t("Coverage")} value={`${Math.round(s.coverage * 100)}%`} />
        <Stat label={t("Tokens")} value={s.tokens.toLocaleString()} hint={s.cost_usd != null ? `$${s.cost_usd}` : t("estimated, no price set")} />
        <Stat label={t("Cases")} value={s.total} />
      </StatStrip>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("By category")}</CardTitle>
          </CardHeader>
          <CategoryBars data={s.by_category} />
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-3.5 w-3.5 text-neutral" /> {t("Baseline regression")}
            </CardTitle>
            <CardDescription>{t("Save this run as a baseline, then check later runs against it.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Input aria-label={t("Baseline name")} value={baseline} onChange={(e) => setBaseline(e.target.value)} className="mono max-w-40" />
              <Button variant="secondary" onClick={saveBaseline} disabled={running}>
                {t("Save as baseline")}
              </Button>
              <Button variant="outline" onClick={check} disabled={running}>
                {t("Check against it")}
              </Button>
            </div>
            {note && <p className="text-xs text-tertiary-text">{note}</p>}
            {reg && <ComparisonView c={reg} />}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader>
          <CardTitle>
            {t("Cases")} <span className="mono ml-1 text-[11px] font-normal text-dim">{cases.length}</span>
          </CardTitle>
          <div className="flex flex-wrap gap-0.5 rounded border border-line bg-surface-low p-px" role="tablist" aria-label={t("Filter by status")}>
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn("h-[22px] cursor-pointer rounded-[2px] px-2 text-xs", filter === f ? "bg-surface-highest text-ink" : "text-neutral hover:text-ink")}
              >
                {f === "ALL" ? t("All") : t(f.toLowerCase())}
              </button>
            ))}
          </div>
        </CardHeader>
        {cases.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-neutral">{t("No cases match.")}</p>
        ) : (
          <div data-testid="cases">
            <div className={`${GRID} border-b border-line py-1.5 text-xs font-medium text-neutral`}>
              <span>{t("Status")}</span>
              <span>{t("Case")}</span>
              <span>{t("Category")}</span>
              <span>{t("Agent")}</span>
              <span>{t("Severity")}</span>
            </div>
            {cases.map((c) => (
              <CaseRow key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const GRID = "grid grid-cols-[78px_minmax(0,1fr)_190px_170px_80px] items-center gap-3 px-3";

function CaseRow({ c, open, onToggle }: { c: CaseResult; open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const rep = primaryRepeat(c);
  return (
    <div className="border-b border-line-soft last:border-b-0">
      <button onClick={onToggle} className={cn(GRID, "w-full cursor-pointer py-1 text-left", open ? "bg-sel" : "hover:bg-surface/60")} aria-expanded={open}>
        <StatusBadge status={c.status} mitigated={c.mitigated} />
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className={cn("h-3 w-3 shrink-0 text-dim transition-transform", open && "rotate-90")} aria-hidden />
          <span className="truncate text-[12.5px]">{c.name}</span>
        </span>
        <span className="truncate text-xs text-neutral">{titleCase(c.category)}</span>
        <span className="mono truncate text-[11.5px] text-neutral">{c.agent}</span>
        <Severity_ severity={c.severity} />
      </button>
      {open && rep && (
        <div className="space-y-2.5 border-t border-line-soft bg-surface-low py-2.5 pl-[105px] pr-3">
          <div className="flex flex-wrap gap-1">
            {c.owasp.map((o) => (
              <Chip key={o}>{o}</Chip>
            ))}
            <Chip>
              {t("pass rate")} {Math.round(c.pass_rate * 100)}%
            </Chip>
            <Chip>
              {rep.tool_calls} {t("tool calls")}
            </Chip>
            <Chip>{fmtMs(rep.duration_ms)}</Chip>
            {rep.blocked_attempts > 0 && (
              <Chip>
                {rep.blocked_attempts} {t("blocked")}
              </Chip>
            )}
          </div>
          <table className="w-full max-w-4xl text-[12.5px]">
            <tbody>
              {rep.assertions.map((a, i) => (
                <tr key={i} className="border-t border-line-soft align-top first:border-t-0">
                  <td className="w-[100px] py-1 pr-2">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="w-[190px] py-1 pr-3">
                    <span className="mono text-[11.5px] text-ink">{a.type}</span> <span className="text-[11px] text-dim">{a.level}</span>
                  </td>
                  <td className="py-1 text-neutral">{a.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.remediation && c.status !== "PASS" && (
            <p className="max-w-4xl text-[12.5px] text-neutral">
              <span className="font-medium text-tertiary-text">{t("Remediation:")}</span> {c.remediation}
            </p>
          )}
          {rep.trace_id && (
            <Button asChild size="sm" variant="secondary">
              <Link to={`/traces/${rep.trace_id}`}>
                <Network className="h-3.5 w-3.5" /> {t("Open trace")}
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
