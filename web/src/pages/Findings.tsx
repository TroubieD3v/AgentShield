import { useState } from "react";
import { Link } from "react-router-dom";
import { Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/form";
import { CategoryName, Chip, Empty, ErrorNote, Loading, PageHeader, Severity_, StatusBadge } from "@/components/common";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/utils";

export default function Findings() {
  const runs = useAsync(() => api.runs());
  const [runId, setRunId] = useState<string>("");
  const f = useAsync(() => api.findings(runId || undefined), [runId]);
  const [sev, setSev] = useState("");
  const done = (runs.data ?? []).filter((r) => r.status === "completed");
  const rows = (f.data?.findings ?? []).filter((x) => !sev || x.severity === sev);

  return (
    <div>
      <PageHeader
        title="Findings"
        subtitle="FAIL means a confirmed violation backed by observed actions. SUSPICIOUS needs a human look. Judge-only signals never become FAIL on their own."
      />
      <div className="mb-4 grid max-w-xl grid-cols-2 gap-3">
        <div>
          <Label htmlFor="f-run">Run</Label>
          <Select id="f-run" value={runId} onChange={(e) => setRunId(e.target.value)}>
            <option value="">Latest completed</option>
            {done.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label || r.id}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-sev">Severity</Label>
          <Select id="f-sev" value={sev} onChange={(e) => setSev(e.target.value)}>
            <option value="">All</option>
            {["critical", "high", "medium", "low"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
      </div>
      {f.loading ? (
        <Loading />
      ) : f.error ? (
        <ErrorNote message={f.error} />
      ) : rows.length === 0 ? (
        <Empty>No findings. {f.data?.run_id ? "This run is clean at the selected severity." : "Run an assessment first."}</Empty>
      ) : (
        <div className="space-y-3" data-testid="findings">
          {rows.map((x) => (
            <Card key={x.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={x.status} />
                  <Severity_ severity={x.severity} />
                  <h3 className="text-[15px] font-semibold">{x.title}</h3>
                  <span className="mono ml-auto text-xs text-muted">{x.id}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Chip>
                    <CategoryName id={x.category} />
                  </Chip>
                  <Chip>{x.agent}</Chip>
                  {x.owasp.map((o) => (
                    <Chip key={o}>{o}</Chip>
                  ))}
                  <Chip>{x.confidence === "confirmed" ? "confirmed by observed action" : "needs review"}</Chip>
                </div>
                <p className="text-[13.5px] text-[#c9ced6]">{x.description}</p>
                {x.evidence.length > 0 && (
                  <ul className="space-y-1 text-[12.5px]">
                    {x.evidence.slice(0, 4).map((e, i) => (
                      <li key={i} className="mono truncate text-muted">
                        #{e.seq} {e.summary}
                      </li>
                    ))}
                  </ul>
                )}
                {x.remediation && (
                  <p className="text-[13px]">
                    <b className="text-amber">Remediation:</b> {x.remediation}
                  </p>
                )}
                {x.trace_id && (
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/traces/${x.trace_id}`}>
                      <Network className="h-3.5 w-3.5" /> Open trace
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
