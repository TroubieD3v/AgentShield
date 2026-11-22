import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  Brain,
  CheckCheck,
  Database,
  FileSearch,
  FlaskConical,
  Hammer,
  ListTree,
  MessageSquare,
  OctagonAlert,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/form";
import { Json } from "@/components/common";
import { cn, fmtMs } from "@/lib/utils";
import type { Trace, TraceEvent } from "@/lib/types";

const META: Record<string, { label: string; kind: string; icon: typeof Bot }> = {
  user_message: { label: "User message", kind: "INPUT", icon: MessageSquare },
  fixture_injection: { label: "Environment", kind: "ENV", icon: FlaskConical },
  document_retrieval: { label: "Retrieval", kind: "RETRIEVAL", icon: FileSearch },
  model_generation: { label: "Model generation", kind: "GENERATION", icon: Brain },
  tool_call: { label: "Tool call", kind: "TOOL", icon: Wrench },
  tool_result: { label: "Tool result", kind: "RESULT", icon: Hammer },
  policy_decision: { label: "Policy", kind: "POLICY", icon: ShieldAlert },
  memory_write: { label: "Memory", kind: "MEMORY", icon: Database },
  agent_message: { label: "Peer message", kind: "MESSAGE", icon: Bot },
  budget: { label: "Budget", kind: "BUDGET", icon: OctagonAlert },
  confirmation: { label: "Confirmation", kind: "CONFIRM", icon: CheckCheck },
  final_response: { label: "Final response", kind: "OUTPUT", icon: MessageSquare },
  error: { label: "Error", kind: "ERROR", icon: OctagonAlert },
};
const metaOf = (e: TraceEvent) => META[e.type] ?? { label: e.type, kind: e.type.toUpperCase(), icon: Bot };

type Tone = "bad" | "ok" | "warn" | null;

function describe(e: TraceEvent, t: (s: string) => string): { title: string; tone: Tone; badge?: string } {
  if (e.type === "tool_call") {
    if (e.executed === false) return { title: `${t("Unexpected tool call")}: ${e.title}`, tone: "bad", badge: t("Blocked before execution") };
    if (e.policy && e.policy.violations.length) return { title: `${t("Unexpected tool call")}: ${e.title}`, tone: "bad", badge: t("Violation detected") };
    return { title: e.title, tone: null };
  }
  if (e.type === "policy_decision") {
    return e.status === "blocked"
      ? { title: t("Policy enforcement"), tone: "ok", badge: t("Blocked") }
      : { title: t("Policy violation"), tone: "bad", badge: e.policy?.decision === "audit" ? t("Audited") : t("Would block") };
  }
  if (e.type === "document_retrieval" && e.attributes["agentshield.injection_suspected"]) {
    return { title: `${e.title}: ${t("untrusted instruction detected")}`, tone: "warn", badge: t("Injection suspected") };
  }
  return { title: e.title, tone: null };
}

const TONE_TEXT: Record<string, string> = { bad: "text-error", ok: "text-secondary", warn: "text-tertiary-text" };
const TONE_BAR: Record<string, string> = { bad: "bg-error", ok: "bg-secondary", warn: "bg-tertiary" };
const TYPE_BAR: Record<string, string> = { model_generation: "bg-accent/70", tool_call: "bg-info", tool_result: "bg-info/60" };

type Tab = "input" | "output" | "policy" | "attributes";

export function TraceTimeline({ trace, highlight }: { trace: Trace; highlight?: number | null }) {
  const { t } = useI18n();
  const [showModel, setShowModel] = useState(false);
  const events = useMemo(() => trace.events.filter((e) => showModel || e.type !== "model_generation"), [trace.events, showModel]);

  // Timeline geometry: every step positioned by its start offset and duration within the whole trace.
  const geo = useMemo(() => {
    const t0 = trace.events.length ? Math.min(...trace.events.map((e) => e.ts)) : trace.started_at;
    const spans = trace.events.map((e) => ({ id: e.id, start: Math.max(0, (e.ts - t0) * 1000), dur: e.duration_ms || 0 }));
    const total = Math.max(1, ...spans.map((s) => s.start + s.dur));
    return { total, byId: Object.fromEntries(spans.map((s) => [s.id, s])) };
  }, [trace]);

  // Tool results and policy decisions nest under the tool call they belong to.
  const depth = useMemo(() => {
    const d: Record<string, number> = {};
    let prev = 0;
    let prevType = "";
    for (const e of events) {
      const nested = (e.type === "tool_result" || e.type === "policy_decision") && (prevType === "tool_call" || prev === 2);
      d[e.id] = nested ? 2 : 1;
      prev = d[e.id];
      prevType = e.type;
    }
    return d;
  }, [events]);

  const initial = useMemo(() => {
    const hit = trace.events.find((e) => describe(e, t).tone === "bad") ?? trace.events.find((e) => describe(e, t).tone) ?? trace.events[0];
    return hit?.id ?? null;
  }, [trace, t]);
  const [selId, setSelId] = useState<string | null>(initial);
  useEffect(() => setSelId(initial), [initial]);
  const sel = trace.events.find((e) => e.id === selId) ?? null;

  return (
    <div className="@container">
      <div className="flex h-9 items-center justify-between gap-3 border-b border-line bg-surface-low px-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-neutral">
          <ListTree className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="mono truncate text-ink">{trace.trace_id}</span>
          <span className="shrink-0">
            · {trace.events.length} {t("events")} · {fmtMs(geo.total)}
          </span>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-neutral">
          <Switch checked={showModel} onCheckedChange={setShowModel} aria-label={t("Show model decisions")} />
          {t("model decisions")}
        </label>
      </div>
      <div className="grid @3xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 border-line @3xl:border-r">
          <div className="grid grid-cols-[minmax(0,1fr)_20%_52px] border-b border-line-soft px-3 py-1 text-[11px] text-dim">
            <span>{t("Step")}</span>
            <span>{t("Timeline")}</span>
            <span className="text-right">{t("Duration")}</span>
          </div>
          <ol className="py-0.5" aria-label={t("Agent execution timeline")}>
            {events.map((e) => {
              const Icon = metaOf(e).icon;
              const d = describe(e, t);
              const g = geo.byId[e.id];
              const lvl = depth[e.id];
              const active = e.id === selId;
              return (
                <li key={e.id} data-testid={`trace-event-${e.type}`}>
                  <button
                    type="button"
                    onClick={() => setSelId(e.id)}
                    aria-current={active || undefined}
                    className={cn(
                      "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_20%_52px] items-center gap-0 px-3 py-[3px] text-left",
                      active ? "bg-sel" : "hover:bg-surface",
                      highlight === e.seq && "outline outline-1 -outline-offset-1 outline-accent",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: (lvl - 1) * 18 }}>
                      <span className="mono w-5 shrink-0 text-right text-[11px] text-dim">{e.seq}</span>
                      {lvl === 2 && <span className="h-px w-2.5 shrink-0 bg-line" aria-hidden />}
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", d.tone ? TONE_TEXT[d.tone] : "text-neutral")} aria-hidden />
                      <span className={cn("min-w-[4rem] truncate text-[12.5px]", d.tone ? TONE_TEXT[d.tone] : "text-ink")} title={d.title}>
                        {d.title}
                      </span>
                      {d.badge && (
                        <Badge tone={d.tone === "ok" ? "ok" : d.tone === "warn" ? "warn" : "bad"} className="shrink-0">
                          {d.badge}
                        </Badge>
                      )}
                      {e.untrusted && (
                        <Badge tone="amber" className="shrink-0">
                          {t("untrusted")}
                        </Badge>
                      )}
                    </span>
                    <span className="relative mx-2 block h-3.5" aria-hidden>
                      <span className="absolute inset-y-[6px] left-0 right-0 bg-line-soft" />
                      <span
                        className={cn("absolute inset-y-[3px] min-w-[3px] rounded-[1px]", d.tone ? TONE_BAR[d.tone] : (TYPE_BAR[e.type] ?? "bg-dim"))}
                        style={{ left: `${(100 * g.start) / geo.total}%`, width: `${(100 * g.dur) / geo.total}%` }}
                      />
                    </span>
                    <span className="mono text-right text-[11px] tabular-nums text-neutral">{e.duration_ms ? fmtMs(e.duration_ms) : "–"}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <StepDetail e={sel} key={sel?.id ?? "none"} />
      </div>
    </div>
  );
}

function StepDetail({ e }: { e: TraceEvent | null }) {
  const { t } = useI18n();
  const hasPolicy = !!e?.policy;
  const [tab, setTab] = useState<Tab>(e?.policy?.violations.length ? "policy" : e?.input != null ? "input" : "output");
  if (!e) return <div className="border-t border-line p-4 text-xs text-neutral @3xl:border-t-0">{t("Select a step to see its input, output and policy decision.")}</div>;
  const m = metaOf(e);
  const Icon = m.icon;
  const d = describe(e, t);
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "input", label: "Input" },
    { id: "output", label: "Output" },
    ...(hasPolicy ? [{ id: "policy" as Tab, label: "Policy", n: e.policy!.violations.length }] : []),
    { id: "attributes", label: "Attributes", n: Object.keys(e.attributes).length },
  ];
  const kv: [string, ReactNode][] = [
    [t("Step"), <span className="mono">#{e.seq}</span>],
    [t("Type"), <span className="mono">{e.type} · {m.kind}</span>],
    [t("Started"), <span className="mono">{new Date(e.ts * 1000).toLocaleTimeString()}</span>],
    [t("Duration"), <span className="mono">{e.duration_ms ? fmtMs(e.duration_ms) : "–"}</span>],
    [t("Status"), <span className="mono">{e.status || "–"}</span>],
    ...(e.executed != null ? ([[t("Executed"), e.executed ? t("yes") : t("no")]] as [string, ReactNode][]) : []),
    ...(e.untrusted ? ([[t("Content"), <span className="text-tertiary-text">{t("untrusted")}</span>]] as [string, ReactNode][]) : []),
  ];
  return (
    <section className="min-w-0 border-t border-line @3xl:border-t-0" aria-label={t("Step details")}>
      <div className="flex items-start gap-2 border-b border-line px-3 py-2">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", d.tone ? TONE_TEXT[d.tone] : "text-neutral")} aria-hidden />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{d.title}</div>
          <div className="text-xs text-neutral">{t(m.label)}</div>
        </div>
        {d.badge && (
          <Badge tone={d.tone === "ok" ? "ok" : d.tone === "warn" ? "warn" : "bad"} className="ml-auto shrink-0">
            {d.badge}
          </Badge>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 border-b border-line px-3 py-2 text-xs">
        {kv.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-neutral">{k}</dt>
            <dd className="min-w-0 truncate text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div role="tablist" aria-label={t("Step data")} className="flex h-8 items-end gap-0.5 border-b border-line px-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              "-mb-px flex h-7 cursor-pointer items-center gap-1.5 border-b-2 px-2 text-xs",
              tab === x.id ? "border-accent font-medium text-ink" : "border-transparent text-neutral hover:text-ink",
            )}
          >
            {t(x.label)}
            {x.n != null && x.n > 0 && <span className="mono text-[10.5px] text-dim">{x.n}</span>}
          </button>
        ))}
      </div>
      <div className="p-3">
        {tab === "input" && (e.input != null ? <Json value={e.input} className="max-h-80" /> : <p className="text-xs text-neutral">{t("No input recorded.")}</p>)}
        {tab === "output" && (e.output != null ? <Json value={e.output} className="max-h-80" /> : <p className="text-xs text-neutral">{t("No output recorded.")}</p>)}
        {tab === "policy" && e.policy && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral">
              {t("Decision")}: <span className="mono text-ink">{e.policy.decision}</span>
              {e.policy.blocked ? <Badge tone="ok">{t("Blocked")}</Badge> : e.policy.violations.length > 0 && <Badge tone="warn">{t("not blocked")}</Badge>}
            </div>
            {e.policy.violations.length === 0 ? (
              <p className="text-xs text-neutral">{t("No rule matched.")}</p>
            ) : (
              <ul className="divide-y divide-line-soft rounded border border-line">
                {e.policy.violations.map((v) => (
                  <li key={v.rule_id} className="flex items-start gap-2 px-2.5 py-1.5 text-[12.5px]">
                    {e.policy!.blocked ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" /> : <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" />}
                    <span className="min-w-0">
                      <span className="mono text-[12px] text-ink">{v.rule_id}</span> <span className="text-xs text-neutral">{v.severity}</span>
                      <span className="block text-neutral">{v.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {tab === "attributes" && <Json value={e.attributes} className="max-h-80" />}
        <p className="mt-2 text-[11px] text-dim">{t("Secrets are redacted before storage. Canary tokens are synthetic.")}</p>
      </div>
    </section>
  );
}
