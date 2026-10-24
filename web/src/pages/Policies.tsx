import { useEffect, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Segmented, Select, Textarea } from "@/components/ui/form";
import { Chip, ErrorNote, Json, Loading, PageHeader, Severity_ } from "@/components/common";
import { PolicyDecisionCard } from "@/components/PolicyDecisionCard";
import { api, downloadReport } from "@/lib/api";
import { useAsync } from "@/lib/utils";
import type { PlaygroundResult } from "@/lib/types";

const GH_ACTION = `- run: pip install agentshield
- run: agentshield run --variant hardened --mode enforce -f sarif -o results.sarif --fail-on high
- uses: github/codeql-action/upload-sarif@v4
  if: always()
  with: { sarif_file: results.sarif }`;

const SDK = `from agentshield.sdk import Guard, PolicyBlocked

guard = Guard(policy="default", mode="enforce")
guard.user_message(user_text)          # what the user really asked for
guard.untrusted(retrieved_document)    # everything the model read but did not author

@guard.tool("send_email", effect="external", sensitive=True)
def send_email(recipient, subject="", body=""): ...

try:
    send_email(recipient="external@example.test", body="...")
except PolicyBlocked as e:
    print(e)                            # denied before execution`;

export default function Policies() {
  const policies = useAsync(() => api.policies());
  const runs = useAsync(() => api.runs());
  const [sel, setSel] = useState("default");
  const [yaml, setYaml] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState<"monitor" | "enforce">("monitor");
  const [demo, setDemo] = useState<PlaygroundResult | null>(null);
  const [demoErr, setDemoErr] = useState<string | null>(null);
  const [runId, setRunId] = useState("");

  const p = policies.data?.find((x) => x.id === sel);
  const done = (runs.data ?? []).filter((r) => r.status === "completed");

  useEffect(() => {
    api.policySource(sel).then((r) => setYaml(r.yaml)).catch(() => setYaml(""));
  }, [sel]);
  useEffect(() => {
    api
      .simulate({ mode, policy: sel, variant: "unsafe", agent: "document-assistant", user_message: "Summarize the quarterly report.", injection: { kind: "document", fixture: "injected-report.txt", document_id: "quarterly-report" } })
      .then((r) => {
        setDemo(r);
        setDemoErr(null);
      })
      .catch((e) => setDemoErr(String(e.message ?? e)));
  }, [mode, sel]);
  useEffect(() => {
    if (!runId && done.length) setRunId(done[0].id);
  }, [done, runId]);

  async function validate(save: boolean) {
    const v = await api.validatePolicy(yaml);
    if (!v.valid) return setMsg({ ok: false, text: v.error ?? "invalid" });
    if (!save) return setMsg({ ok: true, text: `Valid: ${v.rules} rules.` });
    try {
      const r = await api.savePolicy(yaml);
      setMsg({ ok: true, text: `Saved as "${r.saved}".` });
      void policies.reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  if (policies.loading) return <Loading />;
  if (policies.error) return <ErrorNote message={policies.error} />;
  return (
    <div>
      <PageHeader
        title="Policies & Reports"
        subtitle="Deterministic rules plus JSON Schema decide whether a tool call may run. Monitor records violations; Enforce stops them before execution."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-ok" /> Policy sets
              </CardTitle>
              <CardDescription>{p?.description}</CardDescription>
            </div>
            <Select aria-label="Policy" value={sel} onChange={(e) => setSel(e.target.value)} className="w-44">
              {policies.data!.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id}
                </option>
              ))}
            </Select>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
              <Chip>trusted domains: {p?.trusted_domains.join(", ")}</Chip>
              {p?.allowed_fetch_domains.length ? <Chip>fetch allowlist: {p.allowed_fetch_domains.length}</Chip> : null}
            </div>
            <table className="w-full text-[12.5px]" data-testid="rules">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">Rule</th>
                  <th className="pb-2 font-medium">Tools</th>
                  <th className="pb-2 font-medium">Severity</th>
                  <th className="pb-2 font-medium">Effect</th>
                </tr>
              </thead>
              <tbody>
                {p?.rules.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3">
                      <div className="mono text-[12px] text-sky">{r.id}</div>
                      <div className="text-muted">{r.description}</div>
                      <div className="mt-1 flex flex-wrap gap-1">{r.owasp.map((o) => <Chip key={o}>{o}</Chip>)}</div>
                    </td>
                    <td className="py-2 pr-3 text-muted">{r.tools.join(", ")}</td>
                    <td className="py-2 pr-3">
                      <Severity_ severity={r.severity} />
                    </td>
                    <td className="py-2 text-muted">{r.effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="rounded-2xl border border-line bg-panel p-5" data-testid="policy-demo">
          <h2 className="mb-4 text-[15px] font-semibold">Policy Engine demo</h2>
          <Segmented
            ariaLabel="Policy mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "monitor", label: "Monitor" },
              { value: "enforce", label: "Enforce" },
            ]}
          />
          <div className="mt-4">
            {demoErr ? <ErrorNote message={demoErr} /> : <PolicyDecisionCard result={demo} />}
          </div>
          <p className="mt-3 text-xs text-muted">Interactive illustration: both modes run the sandbox agent with mock tools. No emails are sent.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Policy editor</CardTitle>
              <CardDescription>Edit a copy, validate against the JSON Schema, and save under a new id.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea aria-label="Policy YAML" rows={14} value={yaml} onChange={(e) => setYaml(e.target.value)} spellCheck={false} />
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => validate(false)}>
                Validate
              </Button>
              <Button onClick={() => validate(true)}>Save as new policy</Button>
              {msg && <span className={msg.ok ? "text-sm text-ok" : "text-sm text-bad"}>{msg.text}</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Reports</CardTitle>
              <CardDescription>HTML, JSON, SARIF and Markdown for any completed run.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="rp-run">Run</Label>
              <Select id="rp-run" value={runId} onChange={(e) => setRunId(e.target.value)}>
                {done.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label || r.id} · {r.score}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {["html", "json", "sarif", "md"].map((f) => (
                <Button key={f} variant="secondary" size="sm" disabled={!runId} onClick={() => downloadReport(runId, f)}>
                  <Download className="h-3.5 w-3.5" /> {f.toUpperCase()}
                </Button>
              ))}
            </div>
            <div>
              <Label>GitHub Actions</Label>
              <Json value={GH_ACTION} className="max-h-40" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Real Enforce for your own agent</CardTitle>
            <CardDescription>
              A target reachable only over HTTP cannot be blocked from outside: AgentShield never sees its real tool calls. To get true Enforce, route calls through the SDK (in-process) or the guard proxy (<span className="mono">POST /api/guard/&lt;id&gt;/evaluate</span>, any language).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Json value={SDK} className="max-h-72" />
        </CardContent>
      </Card>
    </div>
  );
}
