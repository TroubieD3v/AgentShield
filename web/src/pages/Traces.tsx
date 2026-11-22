import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { ErrorNote, Loading, PageHeader, StatusBadge } from "@/components/common";
import { TraceTimeline } from "@/components/TraceTimeline";
import { api } from "@/lib/api";
import { cn, primaryRepeat, useAsync } from "@/lib/utils";

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
        .filter((c) => primaryRepeat(c)?.trace_id)
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
      <div className="grid gap-3 lg:grid-cols-[270px_minmax(0,1fr)]">
        <Card className="flex h-fit flex-col lg:max-h-[calc(100vh-150px)]">
          <CardHeader>
            <CardTitle>{t("Cases")}</CardTitle>
            <span className="mono text-[11px] text-dim">{cases.length}</span>
          </CardHeader>
          <div className="space-y-1.5 border-b border-line p-2">
            <Select id="tr-run" aria-label={t("Run")} value={runId} onChange={(e) => setRunId(e.target.value)}>
              {done.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label || r.id}
                </option>
              ))}
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-dim" aria-hidden />
              <Input className="pl-6" placeholder={t("Filter cases")} aria-label={t("Filter cases")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {run.loading ? (
            <div className="px-3">
              <Loading />
            </div>
          ) : cases.length === 0 ? (
            <p className="px-3 py-4 text-xs text-neutral">{t("No traces yet.")}</p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-auto py-0.5" data-testid="trace-cases">
              {cases.map((c) => {
                const tid = primaryRepeat(c)!.trace_id!;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => nav(`/traces/${tid}`)}
                      aria-current={tid === traceId || undefined}
                      className={cn(
                        "grid w-full cursor-pointer grid-cols-[66px_minmax(0,1fr)] items-center gap-2 px-2.5 py-1 text-left text-[12.5px]",
                        tid === traceId ? "bg-sel text-ink" : "text-ink/90 hover:bg-surface",
                      )}
                    >
                      <StatusBadge status={c.status} mitigated={c.mitigated} />
                      <span className="min-w-0 truncate" title={c.name}>
                        {c.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="min-w-0 overflow-hidden">
          {!traceId ? (
            <p className="px-4 py-10 text-center text-xs text-neutral">{t("Pick a case on the left.")}</p>
          ) : trace.loading ? (
            <div className="px-3">
              <Loading />
            </div>
          ) : trace.error ? (
            <div className="p-3">
              <ErrorNote message={trace.error} />
            </div>
          ) : (
            trace.data && <TraceTimeline trace={trace.data} />
          )}
        </Card>
      </div>
    </div>
  );
}
