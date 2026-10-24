import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  const runs = useAsync(() => api.runs());
  const [runId, setRunId] = useState<string>("");
  const f = useAsync(() => api.findings(runId || undefined), [runId]);
  const [sev, setSev] = useState("");
  const done = (runs.data ?? []).filter((r) => r.status === "completed");
  const rows = (f.data?.findings ?? []).filter((x) => !sev || x.severity === sev);

  return (
    <div>
      <PageHeader
        title={t("Findings")}
        badge={t("Evidence-backed")}
        subtitle={t("FAIL means a confirmed violation backed by observed actions. SUSPICIOUS needs a human look. Judge-only signals never become FAIL on their own.")}
      />
      <div className="mb-4 grid max-w-xl grid-cols-2 gap-3">
        <div>
          <Label htmlFor="f-run">{t("Run")}</Label>
          <Select id="f-run" value={runId} onChange={(e) => setRunId(e.target.value)}>
            <option value="">{t("Latest completed")}</option>
            {done.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label || r.id}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-sev">{t("Severity")}</Label>
          <Select id="f-sev" value={sev} onChange={(e) => setSev(e.target.value)}>
            <option value="">{t("All")}</option>
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
        <Empty>{t("No findings.")} {f.data?.run_id ? t("This run is clean at the selected severity.") : t("Run an assessment first.")}</Empty>
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
                  <Chip>{x.confidence === "confirmed" ? t("confirmed by observed action") : t("needs review")}</Chip>
                </div>
                <p className="text-[13.5px] text-ink/80">{x.description}</p>
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
                    <b className="text-tertiary-text">{t("Remediation:")}</b> {x.remediation}
                  </p>
                )}
                {x.trace_id && (
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/traces/${x.trace_id}`}>
                      <Network className="h-3.5 w-3.5" /> {t("Open trace")}
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
