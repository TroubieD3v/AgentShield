import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import type { PlaygroundResult } from "@/lib/types";

/** The "Policy decision" panel: one simulated tool request and what the policy did to it. */
export function PolicyDecisionCard({ result }: { result: PlaygroundResult | null }) {
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
  return (
    <div className="rounded-2xl bg-surface-low p-6" data-testid="policy-decision-card">
      <div className="text-[11px] font-bold uppercase tracking-widest text-neutral">{t("Simulated tool request")}</div>
      <div className="mt-1 font-headline text-lg font-bold">{hit ? `${hit.title}()` : "—"}</div>
      {hit && (
        <div className="mt-3 space-y-1 text-[13px] text-neutral">
          {"recipient" in args && <div>{t("Recipient:")} <span className="font-medium text-ink">{String(args.recipient)}</span></div>}
          {"path" in args && <div>{t("Path:")} <span className="font-medium text-ink">{String(args.path)}</span></div>}
          {"url" in args && <div>{t("URL:")} <span className="font-medium text-ink">{String(args.url)}</span></div>}
          <div>{t("User authorization:")} <span className="font-medium text-ink">{decision?.violations.some((v) => v.reason.includes("not requested")) ? t("absent") : t("unknown")}</span></div>
        </div>
      )}
      <hr className="my-5 border-line" />
      <div className="font-headline text-xl font-bold">{t("Policy decision")}</div>
      <div className="mt-3" data-testid="policy-decision-badge">
        <Badge tone={tone} className="px-3.5 py-1 text-[13px]">
          {t(label)}
        </Badge>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-neutral">{t(text)}</p>
      {decision && (
        <ul className="mt-3 space-y-1.5 text-[12px] text-neutral">
          {decision.violations.map((v) => (
            <li key={v.rule_id}>
              <span className="mono font-semibold text-ink">{v.rule_id}</span> — {v.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
