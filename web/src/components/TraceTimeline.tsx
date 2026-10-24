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

function describe(e: TraceEvent): { title: string; tone: "bad" | "ok" | "warn" | null; badge?: string } {
  if (e.type === "tool_call") {
    if (e.executed === false) return { title: `Unexpected tool call: ${e.title}`, tone: "bad", badge: "Blocked before execution" };
    if (e.policy && e.policy.violations.length) return { title: `Unexpected tool call: ${e.title}`, tone: "bad", badge: "Violation detected" };
    return { title: e.title, tone: null };
  }
  if (e.type === "policy_decision") {
    return e.status === "blocked"
      ? { title: "Policy enforcement", tone: "ok", badge: "Blocked" }
      : { title: "Policy violation", tone: "bad", badge: e.policy?.decision === "audit" ? "Audited" : "Would block" };
  }
  if (e.type === "document_retrieval" && e.attributes["agentshield.injection_suspected"]) {
    return { title: `${e.title}: untrusted instruction detected`, tone: "warn", badge: "Injection suspected" };
  }
  return { title: e.title, tone: null };
}

export function TraceTimeline({ trace, highlight }: { trace: Trace; highlight?: number | null }) {
  const [showModel, setShowModel] = useState(false);
  const events = trace.events.filter((e) => showModel || e.type !== "model_generation");
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted">
          <span className="mono">{trace.trace_id}</span> · {trace.events.length} events
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <Switch checked={showModel} onCheckedChange={setShowModel} aria-label="Show model decisions" />
          model decisions
        </label>
      </div>
      <ol className="relative space-y-2" aria-label="Agent execution timeline">
        {events.map((e) => {
          const m = META[e.type] ?? { label: e.type, icon: Bot };
          const Icon = m.icon;
          const d = describe(e);
          const hasBody = e.input != null || e.output != null || (e.policy && e.policy.violations.length > 0);
          return (
            <li
              key={e.id}
              data-testid={`trace-event-${e.type}`}
              className={cn(
                "grid grid-cols-[34px_1fr] gap-3 rounded-xl border bg-panel px-3 py-2.5",
                d.tone === "bad" ? "border-[#5a2626]" : d.tone === "ok" ? "border-[#1f4a37]" : d.tone === "warn" ? "border-[#5e4417]" : "border-line",
                highlight === e.seq && "ring-2 ring-sky",
              )}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                  d.tone === "bad" ? "bg-[#3a1717] text-bad" : d.tone === "ok" ? "bg-[#0f2a1f] text-ok" : d.tone === "warn" ? "bg-[#2a2010] text-warn" : "bg-panel-2 text-muted",
                )}
              >
                {e.seq}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Icon className="h-3.5 w-3.5 text-muted" aria-hidden />
                  <span className="font-medium">{d.title}</span>
                  <span className="text-xs text-muted">{m.label}</span>
                  {e.type === "tool_call" && (
                    <Badge tone={e.executed ? "neutral" : "ok"}>{e.executed ? "executed" : "not executed"}</Badge>
                  )}
                  {d.badge && <Badge tone={d.tone === "ok" ? "ok" : d.tone === "warn" ? "warn" : "bad"}>{d.badge}</Badge>}
                  {e.untrusted && <Badge tone="amber">untrusted content</Badge>}
                  <span className="ml-auto text-[11px] text-muted tabular-nums">
                    {new Date(e.ts * 1000).toLocaleTimeString()} {e.duration_ms ? `· ${fmtMs(e.duration_ms)}` : ""}
                  </span>
                </div>
                {e.policy && e.policy.violations.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {e.policy.violations.map((v) => (
                      <li key={v.rule_id} className="flex items-start gap-2 text-[13px]">
                        {e.policy!.blocked ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-ok" /> : <ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-bad" />}
                        <span>
                          <span className="mono text-[12px] text-sky">{v.rule_id}</span> <span className="text-muted">{v.severity}</span>: {v.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {hasBody && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted hover:text-ink">input / output (secrets redacted)</summary>
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
