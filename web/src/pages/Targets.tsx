import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Check, Minus, Plug, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Chip, ErrorNote, Loading, PageHeader } from "@/components/common";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/utils";

const HARDENING: Record<string, string> = {
  trust_boundaries: "Untrusted content is data",
  acl_retrieval: "ACL-filtered retrieval",
  confirm_sensitive: "Confirms sensitive actions",
  memory_guard: "Memory write guard",
  output_sanitizer: "Output sanitizer",
  secret_guard: "Secret / DLP filter",
  prompt_guard: "Prompt disclosure guard",
  loop_guard: "Loop / budget guard",
};

export default function Targets() {
  const { t } = useI18n();
  const meta = useAsync(() => api.meta());
  const targets = useAsync(() => api.targets());
  const models = useAsync(() => api.models());

  const [tg, setTg] = useState({
    name: "my-agent",
    url: "http://localhost:9000/chat",
    request_template: '{"message": "{{message}}"}',
    response_path: "response",
    tool_calls_path: "",
    telemetry: "none",
    canaries: '{"system_prompt": ""}',
  });
  const [tErr, setTErr] = useState<string | null>(null);
  const [tInfo, setTInfo] = useState<Record<string, string>>({});

  const [m, setM] = useState({ name: "local-llama", kind: "ollama", base_url: "http://localhost:11434", model: "llama3.1", api_key_env: "" });
  const [mErr, setMErr] = useState<string | null>(null);
  const [mInfo, setMInfo] = useState<Record<string, string>>({});

  async function addTarget() {
    setTErr(null);
    try {
      await api.addTarget({
        name: tg.name,
        url: tg.url,
        request_template: JSON.parse(tg.request_template),
        response_path: tg.response_path,
        tool_calls_path: tg.tool_calls_path || null,
        telemetry: tg.telemetry,
        canaries: JSON.parse(tg.canaries || "{}"),
      });
      void targets.reload();
    } catch (e) {
      setTErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function addModel() {
    setMErr(null);
    try {
      await api.addModel({ ...m, api_key_env: m.api_key_env || null });
      void models.reload();
    } catch (e) {
      setMErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (meta.loading) return <Loading />;
  if (meta.error || !meta.data) return <ErrorNote message={meta.error ?? "failed"} />;
  return (
    <div>
      <PageHeader
        title={t("Targets & Models")}
        badge={t("Sandbox ready")}
        subtitle={t("Test the built-in sandbox agents, your own HTTP agent, or drive the sandbox with a live model. Outbound connections are limited to an explicit allowlist.")}
      />

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("Built-in demo agents")}</h2>
      <div className="grid gap-4 lg:grid-cols-3" data-testid="builtin-agents">
        {meta.data.agents.map((a) => (
          <Card key={a.name}>
            <CardHeader>
              <div>
                <CardTitle>{a.title}</CardTitle>
                <CardDescription>{a.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {a.tools.map((x) => (
                  <Chip key={x}>{x}</Chip>
                ))}
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-1 font-medium">{t("Defense")}</th>
                    {a.variants.map((v) => (
                      <th key={v.variant} className="pb-1 text-center font-medium">
                        {v.variant}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(HARDENING).map(([k, label]) => (
                    <tr key={k} className="border-t border-line">
                      <td className="py-1 text-muted">{t(label)}</td>
                      {a.variants.map((v) => (
                        <td key={v.variant} className="py-1 text-center">
                          {v.hardening[k] ? <Check className="mx-auto h-3.5 w-3.5 text-ok" aria-label={t("on")} /> : <Minus className="mx-auto h-3.5 w-3.5 text-neutral/40" aria-label={t("off")} />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-secondary" /> {t("HTTP agent targets")}
              </CardTitle>
              <CardDescription>
                {t("Black-box: AgentShield sees responses (and tool calls only if your app reports them). Missing telemetry yields INCONCLUSIVE, never a pass. Allowed hosts:")}{" "}
                <span className="mono">{meta.data.allowed_hosts.join(", ")}</span>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(targets.data ?? []).map((x) => (
              <div key={x.name} className="flex items-center justify-between gap-3 rounded-xl bg-surface-low px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium">{x.name}</div>
                  <div className="mono truncate text-xs text-muted">{x.url}</div>
                  {tInfo[x.name] && <div className="text-xs font-medium text-tertiary-text">{tInfo[x.name]}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={x.telemetry === "tool_calls" ? "ok" : "warn"}>{t("telemetry:")} {x.telemetry}</Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const r = await api.testTarget(x.name);
                      setTInfo((s) => ({ ...s, [x.name]: r.ok ? `${t("OK")}: ${r.response}` : `${t("Failed")}: ${r.error}` }));
                    }}
                  >
                    {t("Test")}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete target ${x.name}`}
                    onClick={async () => {
                      await api.deleteTarget(x.name);
                      void targets.reload();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <Label htmlFor="t-name">{t("Name")}</Label>
                <Input id="t-name" value={tg.name} onChange={(e) => setTg({ ...tg, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="t-tel">{t("Telemetry you report")}</Label>
                <Select id="t-tel" value={tg.telemetry} onChange={(e) => setTg({ ...tg, telemetry: e.target.value })}>
                  <option value="none">{t("none (text only)")}</option>
                  <option value="tool_calls">{t("tool calls")}</option>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="t-url">{t("Endpoint URL")}</Label>
                <Input id="t-url" value={tg.url} onChange={(e) => setTg({ ...tg, url: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="t-req">{t("Request template (JSON)")}</Label>
                <Textarea id="t-req" rows={2} value={tg.request_template} onChange={(e) => setTg({ ...tg, request_template: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="t-resp">{t("Response path")}</Label>
                <Input id="t-resp" value={tg.response_path} onChange={(e) => setTg({ ...tg, response_path: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="t-tc">{t("Tool calls path")}</Label>
                <Input id="t-tc" value={tg.tool_calls_path} onChange={(e) => setTg({ ...tg, tool_calls_path: e.target.value })} placeholder={t("tool_calls")} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="t-can">{t("Planted canaries (JSON)")}</Label>
                <Textarea id="t-can" rows={2} value={tg.canaries} onChange={(e) => setTg({ ...tg, canaries: e.target.value })} />
                <p className="mt-1 text-xs text-muted">{t("Synthetic secrets you planted in the app under test, so leaks can be detected exactly.")}</p>
              </div>
            </div>
            {tErr && <ErrorNote message={tErr} />}
            <Button onClick={addTarget}>{t("Register target")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("Models")}</CardTitle>
              <CardDescription>
                {t("OpenAI-compatible endpoints and Ollama. Drive the sandbox agents with a real model. API keys are read from an environment variable and never stored or exported.")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(models.data ?? []).map((x) => (
              <div key={x.name} className="flex items-center justify-between gap-3 rounded-xl bg-surface-low px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium">
                    {x.name} <span className="text-xs text-muted">· {x.kind}</span>
                  </div>
                  <div className="mono truncate text-xs text-muted">
                    {x.base_url} · {x.model}
                  </div>
                  {mInfo[x.name] && <div className="text-xs font-medium text-tertiary-text">{mInfo[x.name]}</div>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const r = await api.testModel(x.name);
                      setMInfo((s) => ({ ...s, [x.name]: r.ok ? `${t("OK")}: ${r.response}` : `${t("Failed")}: ${r.error}` }));
                    }}
                  >
                    {t("Test")}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete model ${x.name}`}
                    onClick={async () => {
                      await api.deleteModel(x.name);
                      void models.reload();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <Label htmlFor="m-name">{t("Name")}</Label>
                <Input id="m-name" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="m-kind">{t("Kind")}</Label>
                <Select id="m-kind" value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value })}>
                  <option value="ollama">{t("Ollama")}</option>
                  <option value="openai">{t("OpenAI-compatible")}</option>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="m-url">{t("Base URL")}</Label>
                <Input id="m-url" value={m.base_url} onChange={(e) => setM({ ...m, base_url: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="m-model">{t("Model")}</Label>
                <Input id="m-model" value={m.model} onChange={(e) => setM({ ...m, model: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="m-key">{t("API key env var")}</Label>
                <Input id="m-key" value={m.api_key_env} onChange={(e) => setM({ ...m, api_key_env: e.target.value })} placeholder={t("OPENAI_API_KEY")} />
              </div>
            </div>
            {mErr && <ErrorNote message={mErr} />}
            <Button onClick={addModel}>{t("Register model")}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
