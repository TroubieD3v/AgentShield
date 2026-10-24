import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import {
  Bot,
  Brain,
  CheckCheck,
  Database,
  FileSearch,
  FlaskConical,
  Hammer,
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

const META: Record<string, { label: string; icon: typeof Bot }> = {
  user_message: { label: "User message", icon: MessageSquare },
  fixture_injection: { label: "Environment", icon: FlaskConical },
  document_retrieval: { label: "Retrieval", icon: FileSearch },
  model_generation: { label: "Model generation", icon: Brain },
  tool_call: { label: "Tool call", icon: Wrench },
  tool_result: { label: "Tool result", icon: Hammer },
  policy_decision: { label: "Policy", icon: ShieldAlert },
  memory_write: { label: "Memory", icon: Database },
  agent_message: { label: "Peer message", icon: Bot },
  budget: { label: "Budget", icon: OctagonAlert },
  confirmation: { label: "Confirmation", icon: CheckCheck },
  final_response: { label: "Final response", icon: MessageSquare },
  error: { label: "Error", icon: OctagonAlert },
};

function describe(e: TraceEvent, t: (s: string) => string): { title: string; tone: "bad" | "ok" | "warn" | null; badge?: string } {
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

export function TraceTimeline({ trace, highlight }: { trace: Trace; highlight?: number | null }) {
  const { t } = useI18n();
  const [showModel, setShowModel] = useState(false);
  const events = trace.events.filter((e) => showModel || e.type !== "model_generation");
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-xs text-neutral">
          <span className="mono">{trace.trace_id}</span> · {trace.events.length} {t("events")}
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-neutral">
          <Switch checked={showModel} onCheckedChange={setShowModel} aria-label={t("Show model decisions")} />
          {t("model decisions")}
        </label>
      </div>
      <ol className="relative space-y-2" aria-label={t("Agent execution timeline")}>
        {events.map((e) => {
          const m = META[e.type] ?? { label: e.type, icon: Bot };
          const Icon = m.icon;
          const d = describe(e, t);
          const hasBody = e.input != null || e.output != null || (e.policy && e.policy.violations.length > 0);
          return (
            <li
              key={e.id}
              data-testid={`trace-event-${e.type}`}
              className={cn(
                "grid grid-cols-[34px_1fr] gap-3 rounded-xl px-3.5 py-3",
                d.tone === "bad" ? "bg-error/[0.06]" : d.tone === "ok" ? "bg-secondary/[0.07]" : d.tone === "warn" ? "bg-tertiary/[0.08]" : "bg-surface-low",
                highlight === e.seq && "ring-2 ring-primary",
              )}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full font-headline text-xs font-bold",
                  d.tone === "bad" ? "bg-error text-on-error" : d.tone === "ok" ? "bg-secondary text-on-secondary" : d.tone === "warn" ? "bg-tertiary text-on-tertiary" : "bg-white text-neutral",
                )}
              >
                {e.seq}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Icon className="h-3.5 w-3.5 text-neutral" aria-hidden />
                  <span className="font-semibold">{d.title}</span>
                  <span className="text-xs text-neutral">{t(m.label)}</span>
                  {e.type === "tool_call" && (
                    <Badge tone={e.executed ? "neutral" : "ok"}>{e.executed ? t("executed") : t("not executed")}</Badge>
                  )}
                  {d.badge && <Badge tone={d.tone === "ok" ? "ok" : d.tone === "warn" ? "warn" : "bad"}>{d.badge}</Badge>}
                  {e.untrusted && <Badge tone="amber">{t("untrusted content")}</Badge>}
                  <span className="ml-auto text-[11px] text-neutral tabular-nums">
                    {new Date(e.ts * 1000).toLocaleTimeString()} {e.duration_ms ? `· ${fmtMs(e.duration_ms)}` : ""}
                  </span>
                </div>
                {e.policy && e.policy.violations.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {e.policy.violations.map((v) => (
                      <li key={v.rule_id} className="flex items-start gap-2 text-[13px]">
                        {e.policy!.blocked ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-secondary" /> : <ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-error" />}
                        <span>
                          <span className="mono text-[12px] font-semibold text-ink">{v.rule_id}</span> <span className="text-neutral">{v.severity}</span>: {v.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {hasBody && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-neutral hover:text-ink">{t("input / output (secrets redacted)")}</summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {e.input != null && <Json value={e.input} />}
                      {e.output != null && <Json value={e.output} />}
                    </div>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
