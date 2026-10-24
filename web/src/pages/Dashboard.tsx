import { useNavigate, Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Rocket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryBars, Empty, ErrorNote, Loading, PageHeader, ScoreRing, Stat, StatusBadge } from "@/components/common";
import { RunForm } from "@/components/RunForm";
import { api } from "@/lib/api";
import { fmtTime, useAsync } from "@/lib/utils";
import type { Status } from "@/lib/types";

export default function Dashboard() {
  const nav = useNavigate();
  const dash = useAsync(() => api.dashboard());
  const meta = useAsync(() => api.meta());
  const targets = useAsync(() => api.targets());
  const models = useAsync(() => api.models());
  const findings = useAsync(() => api.findings());

  if (dash.loading || meta.loading) return <Loading />;
  if (dash.error || !dash.data) return <ErrorNote message={dash.error ?? "Failed to load"} />;
  const d = dash.data;
  const s = d.last_run?.summary;
  const trend = d.trend.map((t) => ({ ...t, when: new Date(t.started_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));
  const top = findings.data?.findings.slice(0, 4) ?? [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="How resilient are your agents against prompt injection, tool misuse, data leakage and memory poisoning? Evidence comes from observed actions, not from guessing at model text."
        actions={
          <Button asChild variant="secondary">
            <Link to="/runs">All runs</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Security tests" value={s ? s.total : d.scenario_cases} hint={`${d.scenario_definitions} scenario definitions`} />
        <Stat label="Findings" value={d.last_run ? d.last_run.findings : 0} tone={d.last_run && d.last_run.findings > 0 ? "bad" : undefined} hint="confirmed or suspicious" />
        <Stat
          label="Policy violations"
          value={s ? s.policy_violations_effective : 0}
          tone={s && s.policy_violations_effective > 0 ? "amber" : undefined}
          hint={s ? `${s.policy_violations_attempted} attempted · ${s.mitigated} mitigated` : "no run yet"}
        />
        <Stat label="Coverage" value={s ? `${Math.round(s.coverage * 100)}%` : "-"} hint="conclusive results" />
      </div>

      {!d.last_run ? (
        <Card className="mt-6">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-amber" /> Run your first assessment
              </CardTitle>
              <CardDescription>Starts the built-in sandbox agents. Nothing leaves your machine and every tool is a mock.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{meta.data && <RunForm meta={meta.data} targets={targets.data ?? []} models={models.data ?? []} onStarted={(id) => nav(`/runs/${id}`)} />}</CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Latest run</CardTitle>
                <CardDescription>{d.last_run.label}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <ScoreRing value={d.last_run.summary.score} size={150} />
              <div className="flex flex-wrap justify-center gap-1.5">
                {(Object.entries(d.last_run.summary.counts) as [Status, number][])
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => (
                    <span key={k} className="inline-flex items-center gap-1">
                      <StatusBadge status={k} /> <span className="text-xs text-muted">{n}</span>
                    </span>
                  ))}
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link to={`/runs/${d.last_run.id}`}>
                  Open run <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Resilience by category</CardTitle>
                <CardDescription>Severity-weighted share of passed tests. Lowest first.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <CategoryBars data={d.last_run.summary.by_category} />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Score history</CardTitle>
              <CardDescription>Baseline regression: watch the score move after every fix or model change.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {trend.length < 2 ? (
              <Empty>Run at least two assessments to see a trend.</Empty>
            ) : (
              <div className="h-56" role="img" aria-label="Score history chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="sc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7cc4e8" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#7cc4e8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#232830" vertical={false} />
                    <XAxis dataKey="when" stroke="#6b727d" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke="#6b727d" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ background: "#12151a", border: "1px solid #232830", borderRadius: 10, fontSize: 12 }} />
                    <Area type="monotone" dataKey="score" stroke="#7cc4e8" strokeWidth={2} fill="url(#sc)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top findings</CardTitle>
              <CardDescription>{findings.data?.run_id ? `from run ${findings.data.run_id}` : "no completed run yet"}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/findings">All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <Empty>No findings in the latest run.</Empty>
            ) : (
              <ul className="space-y-2.5">
                {top.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium">{f.title}</div>
                      <div className="text-xs text-muted">
                        {f.severity} · {f.agent}
                      </div>
                    </div>
                    <StatusBadge status={f.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {d.last_run && (
        <p className="mt-4 text-xs text-muted">
          Last run finished {fmtTime(d.trend.at(-1)?.started_at)} · {d.runs_total} runs stored.
        </p>
      )}
    </div>
  );
}
