import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { Empty, ErrorNote, Loading, PageHeader, StatusBadge } from "@/components/common";
import { TraceTimeline } from "@/components/TraceTimeline";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/utils";

export default function Traces() {
  const { t } = useI18n();
  const { traceId } = useParams();
  const nav = useNavigate();
  const runs = useAsync(() => api.runs());
  const [runId, setRunId] = useState("");
  const [q, setQ] = useState("");
  const done = (runs.data ?? []).filter((r) => r.status === "completed");

  useEffect(() => {
    if (!runId && done.length) setRunId(done[0].id);
  }, [done, runId]);

  const run = useAsync(() => (runId ? api.run(runId) : Promise.resolve(null)), [runId]);
  const trace = useAsync(() => (traceId ? api.trace(traceId) : Promise.resolve(null)), [traceId]);

  const cases = useMemo(
    () =>
      (run.data?.cases ?? [])
        .filter((c) => c.repeats[0]?.trace_id)
        .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(b.status !== "PASS") - Number(a.status !== "PASS")),
    [run.data, q],
  );

  async function exportOtel() {
    if (!traceId) return;
    const spans = await api.otel(traceId);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ resourceSpans: spans }, null, 2)], { type: "application/json" }));
    a.download = `${traceId}.otel.json`;
    a.click();
  }

  return (
    <div>
      <PageHeader
        title={t("Trace Explorer")}
        badge={t("OTel GenAI")}
        subtitle={t("The full agent timeline: messages, retrievals, model decisions, tool calls and policy decisions. Compatible with OpenTelemetry GenAI semantic conventions.")}
        actions={
          traceId && (
            <Button size="sm" variant="secondary" onClick={exportOtel}>
              <Download className="h-3.5 w-3.5" /> {t("OTel JSON")}
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("Cases")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="tr-run">{t("Run")}</Label>
              <Select id="tr-run" value={runId} onChange={(e) => setRunId(e.target.value)}>
                {done.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label || r.id}
                  </option>
                ))}
              </Select>
            </div>
            <Input placeholder={t("Filter cases")} aria-label={t("Filter cases")} value={q} onChange={(e) => setQ(e.target.value)} />
            {run.loading ? (
              <Loading />
            ) : cases.length === 0 ? (
              <Empty>{t("No traces yet.")}</Empty>
            ) : (
              <ul className="max-h-[560px] space-y-1 overflow-auto" data-testid="trace-cases">
                {cases.map((c) => {
                  const tid = c.repeats[0].trace_id!;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => nav(`/traces/${tid}`)}
                        className={
                          "flex w-full cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] " +
                          (tid === traceId ? "border-primary bg-surface" : "border-transparent hover:bg-surface-low")
                        }
                      >
                        <StatusBadge status={c.status} />
                        <span className="min-w-0 truncate">{c.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <div>
              <CardTitle>{t("Agent execution timeline")}</CardTitle>
              <CardDescription>{traceId ? t("Secrets are redacted before storage. Canary tokens are synthetic.") : t("Select a case to open its trace.")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!traceId ? (
              <Empty>{t("Pick a case on the left.")}</Empty>
            ) : trace.loading ? (
              <Loading />
            ) : trace.error ? (
              <ErrorNote message={trace.error} />
            ) : (
              trace.data && <TraceTimeline trace={trace.data} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
