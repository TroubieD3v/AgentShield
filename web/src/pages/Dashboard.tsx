import { useI18n } from "@/lib/i18n";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Crosshair } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryBars, ErrorNote, Loading, PageHeader, ScoreBar, Severity_, Stat, StatStrip, StatusBadge } from "@/components/common";
import { RunForm } from "@/components/RunForm";
import { api } from "@/lib/api";
import { cn, fmtTime, useAsync } from "@/lib/utils";
import { useChartColors } from "@/lib/theme";

export default function Dashboard() {
  const { t } = useI18n();
  const cc = useChartColors();
  const nav = useNavigate();
  const dash = useAsync(() => api.dashboard());
  const meta = useAsync(() => api.meta());
  const targets = useAsync(() => api.targets());
  const models = useAsync(() => api.models());
  const findings = useAsync(() => api.findings());

  if (dash.loading || meta.loading) return <Loading />;
  if (dash.error || !dash.data) return <ErrorNote message={dash.error ?? "Failed to load"} />;
  const d = dash.data;
  const last = d.last_run;
  const s = last?.summary;
  const trend = d.trend.slice(-12).map((x, i, arr) => ({ ...x, name: x.label.length > 14 ? x.label.slice(0, 13) + "…" : x.label, isLast: i === arr.length - 1 }));
  const prev = d.trend.length >= 2 ? d.trend[d.trend.length - 2] : null;
  const delta = last && prev ? Math.round((last.summary.score - prev.score) * 10) / 10 : null;
  const open = s ? s.counts.FAIL + s.counts.SUSPICIOUS : 0;
  const agents = s ? Object.entries(s.by_agent) : [];
  const top = (findings.data?.findings ?? []).slice(0, 5);
  const th = "border-b border-line px-3 py-1.5 text-left text-xs font-medium text-neutral";

  return (
    <div>
      <PageHeader
        title={t("Dashboard")}
        badge={s ? (open === 0 ? t("No open findings") : t("{n} open", { n: open })) : undefined}
        badgeWarn={!!s && open > 0}
        subtitle={t("How resilient are your agents against prompt injection, tool misuse, data leakage and memory poisoning? Evidence comes from observed actions, not from guesses about model text.")}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/playground">
                <Crosshair className="h-3.5 w-3.5" /> {t("Attack Playground")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/runs">{t("All runs")}</Link>
            </Button>
          </>
        }
      />

      {!last || !s ? (
        <Card className="max-w-3xl">
          <CardHeader>
            <div>
              <CardTitle>{t("Run your first assessment")}</CardTitle>
              <CardDescription>{t("Starts the built-in sandbox agents. Nothing leaves your machine and every tool is a mock.")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{meta.data && <RunForm meta={meta.data} targets={targets.data ?? []} models={models.data ?? []} onStarted={(id) => nav(`/runs/${id}`)} />}</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-neutral">
            {t("Latest run")}
            <Link to={`/runs/${last.id}`} className="font-medium text-accent hover:underline">
              {last.label}
            </Link>
            <span className="mono text-dim">{last.id}</span>
            <span>· {fmtTime(d.trend.at(-1)?.started_at)}</span>
          </div>
          <StatStrip>
            <Stat label={t("Resilience score")} value={s.score} tone={s.score >= 90 ? "ok" : s.score >= 60 ? "amber" : "bad"} hint={delta == null ? t("first run") : `${delta >= 0 ? "+" : ""}${delta} ${t("vs previous")}`} />
            <Stat label={t("Conclusive coverage")} value={`${Math.round(s.coverage * 100)}%`} />
            <Stat label={t("Failed")} value={s.counts.FAIL} tone={s.counts.FAIL ? "bad" : undefined} />
            <Stat label={t("Suspicious")} value={s.counts.SUSPICIOUS} tone={s.counts.SUSPICIOUS ? "amber" : undefined} />
            <Stat label={t("Policy violations")} value={`${s.policy_violations_effective}/${s.policy_violations_attempted}`} hint={t("effective / attempted")} tone={s.policy_violations_effective ? "bad" : undefined} />
            <Stat label={t("Blocked or mitigated")} value={s.mitigated} />
            <Stat label={t("Cases executed")} value={s.total} hint={t("{n} runs stored", { n: d.runs_total })} />
          </StatStrip>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>{t("Score history")}</CardTitle>
                <CardDescription>{t("Baseline regression: the score after every fix or model change")}</CardDescription>
              </CardHeader>
              <div className="flex-1 px-2 pb-1 pt-3">
                {trend.length < 2 ? (
                  <p className="px-2 py-10 text-center text-xs text-neutral">{t("Run at least two assessments to see a trend.")}</p>
                ) : (
                  <div className="h-full min-h-56" role="img" aria-label={t("Score history chart")}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trend} barCategoryGap="30%">
                        <CartesianGrid stroke={cc.grid} vertical={false} />
                        <XAxis dataKey="name" stroke={cc.neutral} fontSize={10.5} tickLine={false} axisLine={{ stroke: cc.grid }} />
                        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} stroke={cc.neutral} fontSize={10.5} tickLine={false} axisLine={false} width={28} />
                        <Tooltip
                          contentStyle={{ background: cc.panel, color: cc.ink, border: `1px solid ${cc.grid}`, borderRadius: 3, fontSize: 12, padding: "4px 8px" }}
                          cursor={{ fill: cc.cursor }}
                        />
                        <Bar dataKey="score" maxBarSize={26} isAnimationActive={false}>
                          {trend.map((x) => (
                            <Cell key={x.id} fill={cc.accent} fillOpacity={x.isLast ? 1 : 0.4} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Categories")}</CardTitle>
                <span className="text-xs text-neutral">{t("weakest first")}</span>
              </CardHeader>
              <div>
                <CategoryBars data={Object.fromEntries(Object.entries(s.by_category).filter(([c]) => c !== "benign_control"))} />
              </div>
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t("Agents under test")}</CardTitle>
                <span className="text-xs text-neutral">
                  {agents.length} {t("in the latest run")}
                </span>
              </CardHeader>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    <th className={th}>{t("Agent")}</th>
                    <th className={th}>{t("Config")}</th>
                    <th className={cn(th, "text-right")}>{t("Fail")}</th>
                    <th className={cn(th, "text-right")}>{t("Susp.")}</th>
                    <th className={cn(th, "text-right")}>{t("Pass")}</th>
                    <th className={cn(th, "w-[34%]")}>{t("Resilience")}</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(([name, v]) => (
                    <tr key={name} className="border-b border-line-soft last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-1.5 capitalize">{name.split(":")[0].replace(/-/g, " ")}</td>
                      <td className="mono px-3 py-1.5 text-xs text-neutral">{name.split(":")[1] ?? "run"}</td>
                      <td className={cn("mono px-3 py-1.5 text-right text-xs", v.fail ? "text-error" : "text-dim")}>{v.fail}</td>
                      <td className={cn("mono px-3 py-1.5 text-right text-xs", v.suspicious ? "text-tertiary-text" : "text-dim")}>{v.suspicious}</td>
                      <td className="mono px-3 py-1.5 text-right text-xs text-neutral">{v.pass}</td>
                      <td className="px-3 py-1.5">
                        <ScoreBar score={v.score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Fix first")}</CardTitle>
                <Link to="/findings" className="flex items-center gap-1 text-xs text-accent hover:underline">
                  {t("Open findings")} <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              {top.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-neutral">{t("No findings.")}</p>
              ) : (
                <table className="w-full table-fixed text-[12.5px]">
                  <thead>
                    <tr>
                      <th className={cn(th, "w-[92px]")}>{t("Status")}</th>
                      <th className={cn(th, "w-[78px]")}>{t("Severity")}</th>
                      <th className={th}>{t("Finding")}</th>
                      <th className={cn(th, "w-[120px]")}>{t("Agent")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((f) => (
                      <tr key={f.id} className="border-b border-line-soft last:border-b-0">
                        <td className="px-3 py-1.5">
                          <StatusBadge status={f.status} />
                        </td>
                        <td className="px-3 py-1.5">
                          <Severity_ severity={f.severity} />
                        </td>
                        <td className="truncate px-3 py-1.5" title={f.remediation || f.description}>
                          {f.title}
                        </td>
                        <td className="mono truncate px-3 py-1.5 text-xs text-neutral">{f.agent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {top[0]?.remediation && (
                <div className="border-t border-line px-3 py-2 text-xs text-neutral">
                  <Badge tone="warn" className="mr-1.5">
                    {t("Remediation")}
                  </Badge>
                  {top[0].remediation}
                </div>
              )}
            </Card>
          </div>
          <p className="text-[11px] text-dim">{t("Mock tools only, synthetic canary secrets.")}</p>
        </div>
      )}
    </div>
  );
}
