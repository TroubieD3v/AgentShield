import { useI18n } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Segmented, Select } from "@/components/ui/form";
import { CategoryName, Chip, Empty, ErrorNote, Json, Loading, PageHeader, Severity_ } from "@/components/common";
import { api } from "@/lib/api";
import { cn, useAsync } from "@/lib/utils";
import type { ScenarioDef } from "@/lib/types";

export default function Scenarios() {
  const { t } = useI18n();
  const nav = useNavigate();
  const list = useAsync(() => api.scenarios());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [agent, setAgent] = useState("");
  const [sel, setSel] = useState<ScenarioDef | null>(null);
  const [variant, setVariant] = useState<"unsafe" | "partial" | "hardened">("unsafe");
  const [mode, setMode] = useState<"monitor" | "enforce">("monitor");
  const [err, setErr] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (s) =>
          (!cat || s.category === cat) &&
          (!agent || s.agent === agent) &&
          (!q || `${s.id} ${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [list.data, q, cat, agent],
  );
  const cats = [...new Set((list.data ?? []).map((s) => s.category))].sort();
  const agents = [...new Set((list.data ?? []).map((s) => s.agent))].sort();

  async function runOne(s: ScenarioDef) {
    setErr(null);
    try {
      const r = await api.createRun({ scenarios: [s.id], variant, mode, label: `${s.id} · ${variant}/${mode}` });
      nav(`/runs/${r.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorNote message={list.error} />;
  return (
    <div>
      <PageHeader
        title={t("Scenario Library")}
        subtitle={t("{n} reproducible scenarios, each with state, steps and independent assertions. Parameterized scenarios expand into variants.", { n: list.data!.length })}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_200px]">
        <div>
          <Label htmlFor="sc-q">{t("Search")}</Label>
          <Input id="sc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("id, name or description")} />
        </div>
        <div>
          <Label htmlFor="sc-cat">{t("Category")}</Label>
          <Select id="sc-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t("All")}</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="sc-agent">{t("Agent")}</Label>
          <Select id="sc-agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">{t("All")}</option>
            {agents.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_460px]">
        <div className="space-y-2" data-testid="scenario-list">
          {rows.length === 0 && <Empty>{t("No scenarios match.")}</Empty>}
          {rows.map((s) => (
            <button
              key={s.id}
              onClick={() => setSel(s)}
              className={cn(
                "block w-full cursor-pointer rounded-xl border-2 bg-panel px-4 py-3.5 text-left shadow-editorial transition-all hover:shadow-lift",
                sel?.id === s.id ? "border-primary" : "border-transparent",
              )}
            >
              <div className="flex items-center gap-2">
                <Severity_ severity={s.severity} />
                <span className="text-[14px] font-medium">{s.name}</span>
                {s.variants.length > 0 && <Chip>{s.variants.length} {t("variants")}</Chip>}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                <span className="mono">{s.id}</span>
                <span>· <CategoryName id={s.category} /></span>
                <span>· {s.agent}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="lg:sticky lg:top-6 lg:self-start">
          {!sel ? (
            <Empty>{t("Select a scenario to see its steps, assertions and remediation.")}</Empty>
          ) : (
            <Card data-testid="scenario-detail">
              <CardContent className="space-y-4">
                <div>
                  <div className="mono text-xs text-muted">
                    {sel.id} {t("· v")}{sel.version} · {sel.source}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold">{sel.name}</h2>
                  {sel.description && <p className="mt-1 text-[13.5px] text-muted">{sel.description}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sel.owasp.map((o) => (
                    <Chip key={o}>{o}</Chip>
                  ))}
                  <Chip>{sel.agent}</Chip>
                </div>
                <div>
                  <Label>{t("Steps")}</Label>
                  <Json value={sel.steps} className="max-h-48" />
                </div>
                <div>
                  <Label>{t("Assertions (evaluated independently)")}</Label>
                  <Json value={sel.assertions} className="max-h-48" />
                </div>
                {sel.variants.length > 0 && (
                  <div>
                    <Label>{t("Variants")}</Label>
                    <ul className="space-y-1 text-[12.5px] text-muted">
                      {sel.variants.map((v, i) => (
                        <li key={i}>{Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(", ")}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {sel.remediation && (
                  <p className="text-[13px]">
                    <b className="text-tertiary-text">{t("Remediation:")}</b> {sel.remediation}
                  </p>
                )}
                <div className="space-y-3 border-t border-line pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Segmented
                      ariaLabel={t("Agent variant")}
                      value={variant}
                      onChange={setVariant}
                      options={[
                        { value: "unsafe", label: "Unsafe" },
                        { value: "partial", label: "Partial" },
                        { value: "hardened", label: "Hardened" },
                      ]}
                    />
                    <Segmented
                      ariaLabel={t("Policy mode")}
                      value={mode}
                      onChange={setMode}
                      options={[
                        { value: "monitor", label: "Monitor" },
                        { value: "enforce", label: "Enforce" },
                      ]}
                    />
                  </div>
                  <Button onClick={() => runOne(sel)} data-testid="run-scenario">
                    <Play className="h-4 w-4" /> {t("Run this scenario")}
                  </Button>
                  {err && <ErrorNote message={err} />}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
