import { useI18n } from "@/lib/i18n";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, ArrowUpRight, Bot, FileText, Lightbulb, Rocket, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryName, Empty, ErrorNote, Loading, LuminousDial, PageHeader, Severity_ } from "@/components/common";
import { RunForm } from "@/components/RunForm";
import { api } from "@/lib/api";
import { cn, fmtTime, useAsync } from "@/lib/utils";
import { useChartColors } from "@/lib/theme";

const AGENT_ICON: Record<string, typeof Bot> = { "document-assistant": FileText, "office-assistant": Wrench, "research-agent": Bot };

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
  const trend = d.trend.slice(-10).map((t, i, arr) => ({ ...t, name: t.label.length > 12 ? t.label.slice(0, 11) + "…" : t.label, isLast: i === arr.length - 1 }));
  const prev = d.trend.length >= 2 ? d.trend[d.trend.length - 2] : null;
  const delta = last && prev ? Math.round((last.summary.score - prev.score) * 10) / 10 : null;
  const posture = !s ? "-" : s.score >= 90 ? t("Strong") : s.score >= 60 ? t("Fair") : t("Weak");
  const weakest = s ? Object.entries(s.by_category).filter(([c]) => c !== "benign_control").sort((a, b) => a[1].score - b[1].score).slice(0, 3) : [];
  const agents = s ? Object.entries(s.by_agent) : [];
  const topFinding = findings.data?.findings[0];

  return (
    <div>
      <PageHeader
        title={t("Dashboard")}
        badge={s ? (s.counts.FAIL + s.counts.SUSPICIOUS === 0 ? t("No open findings") : t("{n} open", { n: s.counts.FAIL + s.counts.SUSPICIOUS })) : undefined}
        badgeWarn={!!s && s.counts.FAIL + s.counts.SUSPICIOUS > 0}
        subtitle={t("How resilient are your agents against prompt injection, tool misuse, data leakage and memory poisoning? Evidence comes from observed actions, not from guesses about model text.")}
        actions={
          <Button asChild variant="secondary">
            <Link to="/runs">{t("All runs")}</Link>
          </Button>
        }
      />

      {!last || !s ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-tertiary" /> {t("Run your first assessment")}
              </CardTitle>
              <CardDescription>{t("Starts the built-in sandbox agents. Nothing leaves your machine and every tool is a mock.")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{meta.data && <RunForm meta={meta.data} targets={targets.data ?? []} models={models.data ?? []} onStarted={(id) => nav(`/runs/${id}`)} />}</CardContent>
        </Card>
      ) : (
        <>
          {/* Luminous dial */}
          <section className="flex flex-col items-center" aria-label={t("Resilience overview")}>
            <LuminousDial
              score={s.score}
              coverage={s.coverage * 100}
              caption={t("Resilience score")}
              size={300}
              sub={
                <>
                  <ShieldAlert className="h-4 w-4 text-neutral" aria-hidden />
                  {last.findings} {last.findings === 1 ? "finding" : "findings"}
                </>
              }
            />
            <div className="mt-8 grid w-full max-w-md grid-cols-2 gap-8">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-tighter text-neutral">{t("Conclusive coverage")}</div>
                <div className="mt-1 flex items-baseline gap-1 font-headline text-2xl font-bold text-secondary">
                  {Math.round(s.coverage * 100)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-extrabold uppercase tracking-tighter text-neutral">{t("Security posture")}</div>
                <div className="mt-1 font-headline text-2xl font-bold">{posture}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral">
              {t("Outer ring: resilience score · inner ring: conclusive coverage · latest run “")}{last.label}”
            </p>
          </section>

          {/* Agents under test */}
          <section className="mt-14" aria-labelledby="agents-h">
            <div className="mb-5 flex items-end justify-between px-1">
              <div>
                <h2 id="agents-h" className="font-headline text-2xl font-bold tracking-tight">{t("Agents under test")}</h2>
                <p className="text-sm text-neutral">{agents.length} {t("agent configuration")}{agents.length === 1 ? "" : "s"} {t("in the latest run")}</p>
              </div>
              <Link to={`/runs/${last.id}`} className="text-sm font-bold text-secondary hover:underline">
                {t("View all")}
              </Link>
            </div>
            <div className="no-scrollbar flex snap-x gap-5 overflow-x-auto pb-4">
              {agents.map(([name, v]) => {
                const base = name.split(":")[0];
                const Icon = AGENT_ICON[base] ?? Bot;
                const color = v.score >= 90 ? "bg-secondary" : v.score >= 60 ? "bg-tertiary" : "bg-error";
                return (
                  <div key={name} className="w-64 flex-shrink-0 snap-start rounded-2xl bg-surface-low p-6 shadow-editorial transition-all hover:bg-surface">
                    <div className="mb-8 flex items-start justify-between">
                      <div className="rounded-xl bg-secondary/12 p-3 text-secondary">
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <span className="rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-neutral">{name.split(":")[1] ?? "run"}</span>
                    </div>
                    <h3 className="font-headline text-lg font-bold capitalize">{base.replace(/-/g, " ")}</h3>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral">{t("Resilience")}</span>
                        <span className="font-headline font-bold">{v.score}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-highest">
                        <div className={cn("h-full", color)} style={{ width: `${Math.max(3, v.score)}%` }} />
                      </div>
                      <div className="pt-1 text-xs text-neutral">
                        {v.fail} {t("failed ·")} {v.suspicious} {t("suspicious ·")} {v.pass} {t("passed")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Bento */}
          <section className="mt-6 grid gap-5 md:grid-cols-3">
            <div className="group relative overflow-hidden rounded-3xl bg-panel p-8 shadow-editorial md:col-span-2">
              <div className="relative z-10">
                <h3 className="font-headline text-xl font-bold">{t("Replay an attack")}</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral">
                  {t("Run one injection against a sandbox agent in Monitor mode, then flip to Enforce and watch the same call get blocked.")}
                </p>
                <Button asChild className="mt-6">
                  <Link to="/playground">{t("Open Attack Playground")}</Link>
                </Button>
              </div>
              <ShieldAlert className="absolute -bottom-10 -right-6 h-48 w-48 text-ink/[0.05] transition-transform group-hover:scale-110" aria-hidden />
            </div>
            <div className="flex flex-col justify-between rounded-3xl bg-inverse p-8 text-on-inverse">
              <div>
                <ShieldCheck className="h-8 w-8" aria-hidden />
                <h3 className="mt-4 font-headline text-lg font-bold">{t("Policy enforcement")}</h3>
                <p className="mt-2 text-sm text-on-inverse/80">
                  {s.policy_violations_attempted} {t("attempted ·")} {s.mitigated} {t("blocked or mitigated")}
                </p>
              </div>
              <div className="mt-6 font-headline text-3xl font-bold">{s.policy_violations_effective === 0 ? t("Secure") : t("{n} took effect", { n: s.policy_violations_effective })}</div>
            </div>
          </section>

          {/* Weekly insight */}
          <section className="mt-12 grid gap-5 md:grid-cols-12">
            <div className="relative overflow-hidden rounded-3xl bg-surface-low p-8 md:col-span-8">
              <span className="rounded-full bg-secondary/12 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-secondary">{t("Latest insight")}</span>
              <h2 className="mt-4 max-w-lg font-headline text-4xl font-bold leading-tight tracking-tight">
                {delta == null ? (
                  <>{t("Run a second assessment to see how the score moves.")}</>
                ) : delta >= 0 ? (
                  <>
                    {t("Resilience rose by")} <span className="text-secondary">{delta}</span> {t("points since the previous run.")}
                  </>
                ) : (
                  <>
                    {t("Resilience fell by")} <span className="text-error">{Math.abs(delta)}</span> {t("points since the previous run.")}
                  </>
                )}
              </h2>
              <div className="mt-8 flex gap-10">
                <div>
                  <p className="text-sm text-neutral">{t("Cases executed")}</p>
                  <p className="font-headline text-2xl font-bold">{s.total}</p>
                </div>
                <div>
                  <p className="text-sm text-neutral">{t("Runs stored")}</p>
                  <p className="font-headline text-2xl font-bold">{d.runs_total}</p>
                </div>
                <div>
                  <p className="text-sm text-neutral">{t("Scenarios")}</p>
                  <p className="font-headline text-2xl font-bold">{d.scenario_definitions}</p>
                </div>
              </div>
              <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" aria-hidden />
            </div>
            <Link to="/findings" className="flex flex-col justify-between rounded-3xl bg-secondary p-8 text-on-secondary shadow-lift transition-transform hover:-translate-y-0.5 md:col-span-4">
              <div className="flex items-start justify-between">
                <ShieldCheck className="h-9 w-9" aria-hidden />
                <ArrowUpRight className="h-5 w-5 opacity-60" aria-hidden />
              </div>
              <div>
                <p className="font-headline text-4xl font-bold">{last.findings}</p>
                <p className="mt-1 text-sm opacity-85">{last.findings === 1 ? "finding" : "findings"} {t("in the latest run")}</p>
              </div>
            </Link>
          </section>

          {/* Trends */}
          <section className="mt-12" aria-labelledby="trend-h">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 id="trend-h" className="font-headline text-2xl font-bold tracking-tight">{t("Score history")}</h2>
                <p className="text-neutral">{t("Baseline regression: the score after every fix or model change")}</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="h-3 w-3 rounded-full bg-secondary" /> {t("Latest run")}
                <span className="ml-3 h-3 w-3 rounded-full bg-secondary/25" /> {t("Earlier")}
              </div>
            </div>
            <div className="rounded-3xl bg-panel p-8 shadow-editorial">
              {trend.length < 2 ? (
                <Empty>{t("Run at least two assessments to see a trend.")}</Empty>
              ) : (
                <div className="h-64" role="img" aria-label={t("Score history chart")}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend} barCategoryGap="28%">
                      <XAxis dataKey="name" stroke={cc.neutral} fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} stroke={cc.neutral} fontSize={11} tickLine={false} axisLine={false} width={28} />
                      <Tooltip contentStyle={{ background: cc.panel, color: cc.ink, border: "none", borderRadius: 12, fontSize: 12, boxShadow: `0 10px 28px -10px ${cc.shadow}` }} cursor={{ fill: cc.cursor }} />
                      <Bar dataKey="score" radius={[999, 999, 0, 0]} maxBarSize={22}>
                        {trend.map((t) => (
                          <Cell key={t.id} fill={cc.secondary} fillOpacity={t.isLast ? 1 : 0.25} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>

          {/* Weakest categories */}
          {weakest.length > 0 && (
            <section className="mt-12" aria-labelledby="weak-h">
              <h2 id="weak-h" className="mb-5 font-headline text-2xl font-bold tracking-tight">{t("Weakest categories")}</h2>
              <div className="grid gap-5 md:grid-cols-3">
                {weakest.map(([cat, v]) => (
                  <div key={cat} className="flex flex-col justify-between rounded-2xl bg-surface p-6 transition-all hover:bg-surface-high">
                    <div className="flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-highest">
                        <ShieldAlert className="h-5 w-5 text-tertiary" aria-hidden />
                      </div>
                      <span className={cn("text-xs font-bold", v.fail > 0 ? "text-error" : "text-neutral")}>{v.fail} {t("failed")}</span>
                    </div>
                    <div className="mt-8">
                      <h4 className="font-headline text-lg font-bold">
                        <CategoryName id={cat} />
                      </h4>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="font-headline text-3xl font-bold">{v.score}</span>
                        <span className="text-sm text-neutral">/ 100</span>
                      </div>
                      <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface-highest">
                        <div className={cn("h-full", v.score >= 90 ? "bg-secondary" : v.score >= 60 ? "bg-tertiary" : "bg-error")} style={{ width: `${Math.max(3, v.score)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tip */}
          {topFinding && (
            <section className="mt-8 flex flex-col items-center gap-6 rounded-2xl bg-tip p-6 text-on-tip md:flex-row">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-on-tip/10">
                <Lightbulb className="h-7 w-7" aria-hidden />
              </div>
              <div className="flex-1">
                <h4 className="font-headline text-xl font-bold">
                  {t("Fix first:")} {topFinding.title} <Severity_ severity={topFinding.severity} />
                </h4>
                <p className="mt-1 opacity-80">{topFinding.remediation || topFinding.description}</p>
              </div>
              <Button asChild variant="inverted" size="lg">
                <Link to="/findings">
                  {t("Open findings")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </section>
          )}
          <p className="mt-6 text-xs text-neutral">{t("Latest run finished")} {fmtTime(d.trend.at(-1)?.started_at)} {t("· mock tools only, synthetic canary secrets.")}</p>
        </>
      )}
    </div>
  );
}
