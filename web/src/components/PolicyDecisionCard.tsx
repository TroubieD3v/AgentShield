import { Badge } from "@/components/ui/badge";
import type { PlaygroundResult } from "@/lib/types";

/** The "Policy decision" panel from the concept: one simulated tool request and what the policy did to it. */
export function PolicyDecisionCard({ result }: { result: PlaygroundResult | null }) {
  const calls = result?.trace.events.filter((e) => e.type === "tool_call") ?? [];
  const hit = calls.find((e) => e.policy && e.policy.violations.length > 0) ?? null;
  const decision = hit?.policy ?? null;

  let tone: "ok" | "amber" | "neutral" = "neutral";
  let label = "No violation";
  let text = "Every tool call stayed within what the user asked for.";
  if (decision) {
    if (decision.blocked) {
      tone = "ok";
      label = "Blocked";
      text = "The simulated tool call is denied by policy before execution.";
    } else if (decision.decision === "audit") {
      tone = "neutral";
      label = "Audited";
      text = "The rule is audit-only: the call ran and was recorded.";
    } else {
      tone = "amber";
      label = "Would block";
      text = "The policy violation is recorded, but enforcement is disabled. Only a mock tool is used in this demo.";
    }
  }
  const args = (hit?.input ?? {}) as Record<string, unknown>;
  return (
    <div className="rounded-2xl border border-line bg-bg p-5" data-testid="policy-decision-card">
      <div className="text-xs text-muted">Simulated tool request</div>
      <div className="mt-1 text-[15px] font-semibold">{hit ? `${hit.title}()` : "—"}</div>
      {hit && (
        <div className="mt-3 space-y-1 text-[13px] text-muted">
          {"recipient" in args && <div>Recipient: {String(args.recipient)}</div>}
          {"path" in args && <div>Path: {String(args.path)}</div>}
          {"url" in args && <div>URL: {String(args.url)}</div>}
          <div>User authorization: {decision?.violations.some((v) => v.reason.includes("not requested")) ? "absent" : "unknown"}</div>
        </div>
      )}
      <hr className="my-4 border-line" />
      <div className="text-lg font-semibold">Policy decision</div>
      <div className="mt-2" data-testid="policy-decision-badge">
        <Badge tone={tone} className="px-3 py-1 text-[13px]">
          {label}
        </Badge>
      </div>
      <p className="mt-3 text-[13px] text-muted">{text}</p>
      {decision && (
        <ul className="mt-3 space-y-1 text-[12px] text-muted">
          {decision.violations.map((v) => (
            <li key={v.rule_id}>
              <span className="mono text-sky">{v.rule_id}</span> — {v.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
