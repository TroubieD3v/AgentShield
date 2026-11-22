import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GitCompare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/form";
import { ErrorNote, Loading, PageHeader, ScoreBar, StatusBadge } from "@/components/common";
import { RunForm } from "@/components/RunForm";
import { api } from "@/lib/api";
import { fmtTime, titleCase, useAsync, usePolling } from "@/lib/utils";
import { useChartColors } from "@/lib/theme";
import type { Comparison } from "@/lib/types";

export default function Runs() {
  const { t } = useI18n();
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
  const th = "border-b border-line px-3 py-1.5 text-left text-xs font-medium text-neutral";
  return (
    <div>
      <PageHeader title={t("Test Runs")} subtitle={t("Every run stores its configuration, per-case evidence and traces, so results are reproducible and comparable.")} />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("History")}</CardTitle>
              <span className="mono text-[11px] text-dim">{runs.data?.length ?? 0}</span>
            </CardHeader>
            {runs.loading && !runs.data ? (
              <div className="px-3">
                <Loading />
              </div>
            ) : runs.error ? (
              <div className="p-3">
                <ErrorNote message={runs.error} />
              </div>
            ) : (runs.data ?? []).length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-neutral">{t("No runs yet. Start one on the right.")}</p>
            ) : (
              <table className="w-full text-[12.5px]" data-testid="runs-table">
                <thead>
                  <tr>
                    <th className={th}>{t("Run")}</th>
                    <th className={th}>{t("Config")}</th>
                    <th className={`${th} w-[30%]`}>{t("Score")}</th>
                    <th className={th}>{t("Started")}</th>
                    <th className={`${th} w-8`} />
                  </tr>
                </thead>
                <tbody>
                  {runs.data!.map((r) => (
                    <tr key={r.id} className="border-b border-line-soft last:border-b-0 hover:bg-surface/60">
                      <td className="px-3 py-1">
                        <Link to={`/runs/${r.id}`} className="text-accent hover:underline">
                          {r.label || r.id}
                        </Link>
                        <span className="mono ml-2 text-[11px] text-dim">{r.id}</span>
                      </td>
                      <td className="mono px-3 py-1 text-xs text-neutral">
                        {r.variant} · {r.mode}
                      </td>
                      <td className="px-3 py-1">
                        {r.status === "completed" ? <ScoreBar score={r.score ?? 0} /> : <Badge tone={r.status === "failed" ? "bad" : "amber"}>{r.status}</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1 text-xs text-neutral">{fmtTime(r.started_at)}</td>
                      <td className="px-2 py-1 text-right">
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
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="h-3.5 w-3.5 text-neutral" /> {t("Compare runs")}
              </CardTitle>
              <CardDescription>{t("Two models, two agent versions, or before and after a fix.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid items-end gap-2 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label htmlFor="cmp-a">{t("Before (A)")}</Label>
                  <Select id="cmp-a" value={a} onChange={(e) => setA(e.target.value)}>
                    <option value="">{t("select a run")}</option>
                    {done.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label || r.id} · {r.score}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="cmp-b">{t("After (B)")}</Label>
                  <Select id="cmp-b" value={b} onChange={(e) => setB(e.target.value)}>
                    <option value="">{t("select a run")}</option>
                    {done.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label || r.id} · {r.score}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button onClick={compare} disabled={!a || !b} data-testid="compare">
                  {t("Compare")}
                </Button>
              </div>
              {cmpErr && <ErrorNote message={cmpErr} />}
              {cmp && <ComparisonView c={cmp} />}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("New run")}</CardTitle>
            <CardDescription>{t("Runs in the background; progress appears in the history.")}</CardDescription>
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
  const { t } = useI18n();
  const cc = useChartColors();
  const data = c.categories.map((x) => ({ name: titleCase(x.category), A: x.a ?? 0, B: x.b ?? 0 }));
  return (
    <div className="space-y-3" data-testid="comparison">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-muted">
          {c.a.label}: <b className="mono font-medium text-ink">{c.a.score}</b>
        </span>
        <span aria-hidden className="text-dim">
          →
        </span>
        <span className="text-muted">
          {c.b.label}: <b className="mono font-medium text-ink">{c.b.score}</b>
        </span>
        <Badge tone={c.delta_score >= 0 ? "ok" : "bad"} className="mono">
          {c.delta_score >= 0 ? "+" : ""}
          {c.delta_score}
        </Badge>
        <Badge tone={c.regressions.length ? "bad" : "ok"} data-testid="regression-count">
          {c.regressions.length} {t("regression(s)")}
        </Badge>
        <Badge tone="ok">
          {c.improvements.length} {t("improved")}
        </Badge>
      </div>
      <div className="h-64 rounded border border-line-soft bg-surface-low pt-3" role="img" aria-label={t("Pass-rate comparison by category")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -10, right: 8 }} barGap={1}>
            <CartesianGrid stroke={cc.grid} vertical={false} />
            <XAxis dataKey="name" stroke={cc.neutral} fontSize={10} tickLine={false} interval={0} angle={-25} textAnchor="end" height={70} axisLine={{ stroke: cc.grid }} />
            <YAxis domain={[0, 100]} stroke={cc.neutral} fontSize={10.5} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: cc.panel, color: cc.ink, border: `1px solid ${cc.grid}`, borderRadius: 3, fontSize: 12, padding: "4px 8px" }} cursor={{ fill: cc.cursor }} />
            <Legend wrapperStyle={{ fontSize: 11.5 }} iconType="square" iconSize={9} />
            <Bar dataKey="A" name={c.a.label} fill={cc.neutral} fillOpacity={0.55} isAnimationActive={false} />
            <Bar dataKey="B" name={c.b.label} fill={cc.accent} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {c.regressions.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-bad">{t("Regressions")}</div>
          <ul className="divide-y divide-line-soft rounded border border-line text-[12.5px]">
            {c.regressions.map((r) => (
              <li key={r.key} className="flex items-center gap-2 px-2.5 py-1">
                <StatusBadge status={r.from} /> <span className="text-dim">→</span> <StatusBadge status={r.to} /> {r.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
