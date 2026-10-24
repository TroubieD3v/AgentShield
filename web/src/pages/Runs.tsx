import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GitCompare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/form";
import { Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "@/components/common";
import { RunForm } from "@/components/RunForm";
import { api } from "@/lib/api";
import { fmtTime, titleCase, useAsync, usePolling } from "@/lib/utils";
import type { Comparison } from "@/lib/types";

export default function Runs() {
  const nav = useNavigate();
  const runs = useAsync(() => api.runs());
  const meta = useAsync(() => api.meta());
  const targets = useAsync(() => api.targets());
  const models = useAsync(() => api.models());
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [cmpErr, setCmpErr] = useState<string | null>(null);

  const active = (runs.data ?? []).some((r) => r.status === "queued" || r.status === "running");
  usePolling(() => void runs.reload(), 1500, active);

  async function compare() {
    setCmpErr(null);
    try {
      setCmp(await api.compare(a, b));
    } catch (e) {
      setCmpErr(e instanceof Error ? e.message : String(e));
    }
  }

  const done = (runs.data ?? []).filter((r) => r.status === "completed");
  return (
    <div>
      <PageHeader title="Test Runs" subtitle="Every run stores its configuration, per-case evidence and traces, so results are reproducible and comparable." />
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.loading && !runs.data ? (
                <Loading />
              ) : runs.error ? (
                <ErrorNote message={runs.error} />
              ) : (runs.data ?? []).length === 0 ? (
                <Empty>No runs yet. Start one on the right.</Empty>
              ) : (
                <table className="w-full text-[13px]" data-testid="runs-table">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="pb-2 font-medium">Run</th>
                      <th className="pb-2 font-medium">Config</th>
                      <th className="pb-2 font-medium">Score</th>
                      <th className="pb-2 font-medium">Started</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {runs.data!.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-2.5">
                          <Link to={`/runs/${r.id}`} className="font-medium text-sky hover:underline">
                            {r.label || r.id}
                          </Link>
                          <div className="mono text-[11px] text-muted">{r.id}</div>
                        </td>
                        <td className="py-2.5 text-muted">
                          {r.variant} · {r.mode}
                        </td>
                        <td className="py-2.5 tabular-nums">
                          {r.status === "completed" ? (
                            r.score
                          ) : (
                            <Badge tone={r.status === "failed" ? "bad" : "amber"}>{r.status}</Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-muted">{fmtTime(r.started_at)}</td>
                        <td className="py-2.5 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete run ${r.id}`}
                            onClick={async () => {
                              await api.deleteRun(r.id);
                              void runs.reload();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-4 w-4 text-sky" /> Compare runs
                </CardTitle>
                <CardDescription>Two models, two agent versions, or before and after a fix.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label htmlFor="cmp-a">Before (A)</Label>
                  <Select id="cmp-a" value={a} onChange={(e) => setA(e.target.value)}>
                    <option value="">select a run</option>
                    {done.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label || r.id} · {r.score}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="cmp-b">After (B)</Label>
                  <Select id="cmp-b" value={b} onChange={(e) => setB(e.target.value)}>
                    <option value="">select a run</option>
                    {done.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label || r.id} · {r.score}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button onClick={compare} disabled={!a || !b} data-testid="compare">
                  Compare
                </Button>
              </div>
              {cmpErr && <ErrorNote message={cmpErr} />}
              {cmp && <ComparisonView c={cmp} />}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <div>
              <CardTitle>New run</CardTitle>
              <CardDescription>Runs in the background; progress appears in the history.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {meta.data && <RunForm meta={meta.data} targets={targets.data ?? []} models={models.data ?? []} compact onStarted={(id) => nav(`/runs/${id}`)} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ComparisonView({ c }: { c: Comparison }) {
  const data = c.categories.map((x) => ({ name: titleCase(x.category), A: x.a ?? 0, B: x.b ?? 0 }));
  return (
    <div className="space-y-4" data-testid="comparison">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">
          {c.a.label}: <b className="text-ink">{c.a.score}</b>
        </span>
        <span aria-hidden>→</span>
        <span className="text-muted">
          {c.b.label}: <b className="text-ink">{c.b.score}</b>
        </span>
        <Badge tone={c.delta_score >= 0 ? "ok" : "bad"}>
          {c.delta_score >= 0 ? "+" : ""}
          {c.delta_score}
        </Badge>
        <Badge tone={c.regressions.length ? "bad" : "ok"} data-testid="regression-count">
          {c.regressions.length} regression(s)
        </Badge>
        <Badge tone="ok">{c.improvements.length} improved</Badge>
      </div>
      <div className="h-72" role="img" aria-label="Pass-rate comparison by category">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -10 }}>
            <CartesianGrid stroke="#232830" vertical={false} />
            <XAxis dataKey="name" stroke="#6b727d" fontSize={10} tickLine={false} interval={0} angle={-25} textAnchor="end" height={70} />
            <YAxis domain={[0, 100]} stroke="#6b727d" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#12151a", border: "1px solid #232830", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#ffffff08" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="A" name={c.a.label} fill="#e8a33d" radius={[4, 4, 0, 0]} />
            <Bar dataKey="B" name={c.b.label} fill="#7cc4e8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {c.regressions.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-bad">Regressions</div>
          <ul className="space-y-1 text-[13px]">
            {c.regressions.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <StatusBadge status={r.from} /> → <StatusBadge status={r.to} /> {r.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
