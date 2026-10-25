import { useI18n } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Flag, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { CategoryBars, Chip, Empty, ErrorNote, Loading, PageHeader, ScoreRing, Severity_, Stat, StatusBadge } from "@/components/common";
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
                <Download className="h-3.5 w-3.5" /> {f.toUpperCase()}
              </Button>
            ))}
          </>
        }
      />
      {running && (
        <Card className="mb-4">
          <CardContent className="flex items-center gap-4 py-3">
            <Badge tone="amber">{r.status}</Badge>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-amber transition-all" style={{ width: `${(100 * r.progress.done) / Math.max(1, r.progress.total)}%` }} />
            </div>
            <span className="text-sm tabular-nums text-muted">
              {r.progress.done}/{r.progress.total}
            </span>
          </CardContent>
        </Card>
      )}
      {r.error && <ErrorNote message={r.error} />}

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card>
          <CardContent className="flex items-center justify-center py-6">
            <ScoreRing value={s.score} size={150} />
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label={t("Passed")} value={s.counts.PASS} tone="ok" hint={s.mitigated ? t("{n} only mitigated ★", { n: s.mitigated }) : undefined} />
          <Stat label={t("Failed")} value={s.counts.FAIL} tone={s.counts.FAIL ? "bad" : undefined} />
          <Stat label={t("Suspicious")} value={s.counts.SUSPICIOUS} tone={s.counts.SUSPICIOUS ? "amber" : undefined} hint={t("needs review")} />
          <Stat label={t("Inconclusive")} value={s.counts.INCONCLUSIVE + s.counts.ERROR} hint={t("no telemetry / errors")} />
          <Stat label={t("Violations")} value={`${s.policy_violations_effective}/${s.policy_violations_attempted}`} hint={t("effective / attempted")} />
          <Stat label={t("Coverage")} value={`${Math.round(s.coverage * 100)}%`} />
          <Stat label={t("Tokens")} value={s.tokens.toLocaleString()} hint={s.cost_usd != null ? `$${s.cost_usd}` : t("estimated, no price set")} />
          <Stat label={t("Cases")} value={s.total} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("By category")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBars data={s.by_category} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-tertiary" /> {t("Baseline regression")}
              </CardTitle>
              <CardDescription>{t("Save this run as a baseline, then check later runs against it.")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input aria-label={t("Baseline name")} value={baseline} onChange={(e) => setBaseline(e.target.value)} className="max-w-48" />
              <Button variant="secondary" onClick={saveBaseline} disabled={running}>
                {t("Save as baseline")}
              </Button>
              <Button variant="outline" onClick={check} disabled={running}>
                {t("Check against it")}
              </Button>
            </div>
            {note && <p className="text-xs font-medium text-tertiary-text">{note}</p>}
            {reg && <ComparisonView c={reg} />}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("Cases")}</CardTitle>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("Filter by status")}>
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  filter === f ? "border-primary bg-primary text-on-primary" : "border-line text-neutral hover:text-ink",
                )}
              >
                {f === "ALL" ? t("All") : t(f.toLowerCase())}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <Empty>{t("No cases match.")}</Empty>
          ) : (
            <div className="divide-y divide-line" data-testid="cases">
              {cases.map((c) => (
                <CaseRow key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CaseRow({ c, open, onToggle }: { c: CaseResult; open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const rep = primaryRepeat(c);
  return (
    <div className="py-2.5">
      <button onClick={onToggle} className="grid w-full cursor-pointer grid-cols-[110px_1fr_auto] items-center gap-3 text-left" aria-expanded={open}>
        <StatusBadge status={c.status} mitigated={c.mitigated} />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium">{c.name}</div>
          <div className="text-xs text-muted">
            {titleCase(c.category)} · {c.agent}
          </div>
        </div>
        <Severity_ severity={c.severity} />
      </button>
      {open && rep && (
        <div className="mt-3 space-y-3 rounded-xl bg-surface-low p-4">
          <div className="flex flex-wrap gap-1.5">
            {c.owasp.map((o) => (
              <Chip key={o}>{o}</Chip>
            ))}
            <Chip>{t("pass rate")} {Math.round(c.pass_rate * 100)}%</Chip>
            <Chip>{rep.tool_calls} {t("tool calls")}</Chip>
            <Chip>{fmtMs(rep.duration_ms)}</Chip>
            {rep.blocked_attempts > 0 && <Chip>{rep.blocked_attempts} {t("blocked")}</Chip>}
          </div>
          <ul className="space-y-2">
            {rep.assertions.map((a, i) => (
              <li key={i} className="grid grid-cols-[110px_1fr] gap-3 text-[13px]">
                <StatusBadge status={a.status} />
                <div>
                  <span className="mono text-[12px] font-semibold text-ink">{a.type}</span> <span className="text-xs text-muted">({a.level})</span>
                  <div className="text-ink/80">{a.message}</div>
                </div>
              </li>
            ))}
          </ul>
          {c.remediation && c.status !== "PASS" && (
            <p className="text-[13px]">
              <b className="text-tertiary-text">{t("Remediation:")}</b> {c.remediation}
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
