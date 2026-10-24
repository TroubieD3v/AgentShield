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
import { cn, fmtMs, fmtTime, titleCase, useAsync, usePolling } from "@/lib/utils";
import type { CaseResult, Comparison, Status } from "@/lib/types";

const FILTERS: (Status | "ALL")[] = ["ALL", "FAIL", "SUSPICIOUS", "PASS", "INCONCLUSIVE", "ERROR"];

export default function RunDetail() {
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
      setNote(`Saved as baseline "${baseline}".`);
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
        subtitle={`${r.config.target} · ${r.config.variant} · ${r.config.mode} mode · policy ${r.config.policy} · ${r.config.brain} · started ${fmtTime(r.started_at)}`}
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
          <Stat label="Passed" value={s.counts.PASS} tone="ok" hint={s.mitigated ? `${s.mitigated} only mitigated ★` : undefined} />
          <Stat label="Failed" value={s.counts.FAIL} tone={s.counts.FAIL ? "bad" : undefined} />
          <Stat label="Suspicious" value={s.counts.SUSPICIOUS} tone={s.counts.SUSPICIOUS ? "amber" : undefined} hint="needs review" />
          <Stat label="Inconclusive" value={s.counts.INCONCLUSIVE + s.counts.ERROR} hint="no telemetry / errors" />
          <Stat label="Violations" value={`${s.policy_violations_effective}/${s.policy_violations_attempted}`} hint="effective / attempted" />
          <Stat label="Coverage" value={`${Math.round(s.coverage * 100)}%`} />
          <Stat label="Tokens" value={s.tokens.toLocaleString()} hint={s.cost_usd != null ? `$${s.cost_usd}` : "estimated, no price set"} />
          <Stat label="Cases" value={s.total} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBars data={s.by_category} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-amber" /> Baseline regression
              </CardTitle>
              <CardDescription>Save this run as a baseline, then check later runs against it.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input aria-label="Baseline name" value={baseline} onChange={(e) => setBaseline(e.target.value)} className="max-w-48" />
              <Button variant="secondary" onClick={saveBaseline} disabled={running}>
                Save as baseline
              </Button>
              <Button variant="outline" onClick={check} disabled={running}>
                Check against it
              </Button>
            </div>
            {note && <p className="text-xs text-amber">{note}</p>}
            {reg && <ComparisonView c={reg} />}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Cases</CardTitle>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  filter === f ? "border-sky bg-[#0e2230] text-sky" : "border-line text-muted hover:text-ink",
                )}
              >
                {f === "ALL" ? "All" : f.toLowerCase()}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <Empty>No cases match.</Empty>
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
  const rep = c.repeats.find((x) => x.status !== "PASS") ?? c.repeats[0];
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
        <div className="mt-3 space-y-3 rounded-xl border border-line bg-bg p-4">
          <div className="flex flex-wrap gap-1.5">
            {c.owasp.map((o) => (
              <Chip key={o}>{o}</Chip>
            ))}
            <Chip>pass rate {Math.round(c.pass_rate * 100)}%</Chip>
            <Chip>{rep.tool_calls} tool calls</Chip>
            <Chip>{fmtMs(rep.duration_ms)}</Chip>
            {rep.blocked_attempts > 0 && <Chip>{rep.blocked_attempts} blocked</Chip>}
          </div>
          <ul className="space-y-2">
            {rep.assertions.map((a, i) => (
              <li key={i} className="grid grid-cols-[110px_1fr] gap-3 text-[13px]">
                <StatusBadge status={a.status} />
                <div>
                  <span className="mono text-[12px] text-sky">{a.type}</span> <span className="text-xs text-muted">({a.level})</span>
                  <div className="text-[#c9ced6]">{a.message}</div>
                </div>
              </li>
            ))}
          </ul>
          {c.remediation && c.status !== "PASS" && (
            <p className="text-[13px]">
              <b className="text-amber">Remediation:</b> {c.remediation}
            </p>
          )}
          {rep.trace_id && (
            <Button asChild size="sm" variant="secondary">
              <Link to={`/traces/${rep.trace_id}`}>
                <Network className="h-3.5 w-3.5" /> Open trace
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
