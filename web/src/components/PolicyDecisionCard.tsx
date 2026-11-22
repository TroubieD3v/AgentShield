import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlaygroundResult } from "@/lib/types";

/** The "Policy decision" panel: one simulated tool request and what the policy did to it. */
export function PolicyDecisionCard({ result, bare }: { result: PlaygroundResult | null; bare?: boolean }) {
  const { t } = useI18n();
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
  const rows: [string, string][] = [];
  if (hit) {
    if ("recipient" in args) rows.push([t("Recipient:"), String(args.recipient)]);
    if ("path" in args) rows.push([t("Path:"), String(args.path)]);
    if ("url" in args) rows.push([t("URL:"), String(args.url)]);
    rows.push([t("User authorization:"), decision?.violations.some((v) => v.reason.includes("not requested")) ? t("absent") : t("unknown")]);
  }
  return (
    <div className={cn(!bare && "rounded border border-line bg-panel")} data-testid="policy-decision-card">
      <div className={cn("flex min-h-9 items-center justify-between gap-3 border-b border-line px-3 py-1.5", bare && "bg-surface-low")}>
        <h3 className="text-[12.5px] font-semibold">{t("Policy decision")}</h3>
        <div data-testid="policy-decision-badge">
          <Badge tone={tone}>{t(label)}</Badge>
        </div>
      </div>
      <div className="space-y-2 p-3">
        <div>
          <div className="text-xs text-neutral">{t("Simulated tool request")}</div>
          <div className="mono text-[13px] text-ink">{hit ? `${hit.title}()` : "—"}</div>
        </div>
        {rows.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-neutral">{k.replace(/:$/, "")}</dt>
                <dd className="mono min-w-0 truncate text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-[12.5px] leading-snug text-neutral">{t(text)}</p>
        {decision && (
          <ul className="divide-y divide-line-soft rounded border border-line text-xs">
            {decision.violations.map((v) => (
              <li key={v.rule_id} className="px-2.5 py-1.5">
                <span className="mono text-ink">{v.rule_id}</span>
                <span className="block text-neutral">{v.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
