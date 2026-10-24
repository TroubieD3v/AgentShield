import type {
  Comparison,
  Dashboard,
  Finding,
  Meta,
  ModelSpec,
  PlaygroundResult,
  Policy,
  Run,
  RunConfig,
  RunListItem,
  ScenarioDef,
  TargetSpec,
  Trace,
} from "./types";

const TOKEN_KEY = "agentshield.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setToken = (t: string) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => req<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  meta: () => req<Meta>("/meta"),
  dashboard: () => req<Dashboard>("/dashboard"),
  scenarios: () => req<ScenarioDef[]>("/scenarios"),
  policies: () => req<Policy[]>("/policies"),
  policySource: (id: string) => req<{ id: string; yaml: string }>(`/policies/${id}/source`),
  validatePolicy: (yaml: string) => post<{ valid: boolean; rules?: number; error?: string }>("/policies/validate", { yaml }),
  savePolicy: (yaml: string) => post<{ saved: string }>("/policies", { yaml }),
  runs: () => req<RunListItem[]>("/runs"),
  run: (id: string) => req<Run>(`/runs/${id}`),
  createRun: (cfg: Partial<RunConfig>) => post<{ id: string; status: string; total: number; warnings: string[] }>("/runs", cfg),
  deleteRun: (id: string) => req<{ deleted: string }>(`/runs/${id}`, { method: "DELETE" }),
  compare: (a: string, b: string) => req<Comparison>(`/compare?a=${a}&b=${b}`),
  regression: (id: string, baseline: string) => req<Comparison>(`/runs/${id}/regression?baseline=${encodeURIComponent(baseline)}`),
  setBaseline: (name: string, run_id: string) => post<{ name: string }>("/baselines", { name, run_id }),
  trace: (id: string) => req<Trace>(`/traces/${id}`),
  otel: (id: string) => req<unknown[]>(`/traces/${id}?format=otel`),
  findings: (run_id?: string) => req<{ run_id: string | null; findings: Finding[] }>(`/findings${run_id ? `?run_id=${run_id}` : ""}`),
  fixtures: () => req<{ name: string; content: string }[]>("/fixtures"),
  simulate: (body: Record<string, unknown>) => post<PlaygroundResult>("/playground/simulate", body),
  targets: () => req<TargetSpec[]>("/targets"),
  addTarget: (t: Partial<TargetSpec>) => post<TargetSpec>("/targets", t),
  deleteTarget: (n: string) => req<unknown>(`/targets/${n}`, { method: "DELETE" }),
  testTarget: (n: string) => post<{ ok: boolean; response?: string; error?: string; telemetry?: Record<string, boolean> }>(`/targets/${n}/test`, {}),
  models: () => req<ModelSpec[]>("/models"),
  addModel: (m: Partial<ModelSpec>) => post<ModelSpec>("/models", m),
  deleteModel: (n: string) => req<unknown>(`/models/${n}`, { method: "DELETE" }),
  testModel: (n: string) => post<{ ok: boolean; response?: string; error?: string }>(`/models/${n}/test`, {}),
  reportUrl: (id: string, format: string) => `/api/runs/${id}/report?format=${format}&download=true`,
  reportText: async (id: string, format: string) => {
    const token = getToken();
    const res = await fetch(`/api/runs/${id}/report?format=${format}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    return res.text();
  },
};

export async function downloadReport(id: string, format: string) {
  const text = await api.reportText(id, format);
  const mime = format === "html" ? "text/html" : format === "md" ? "text/markdown" : "application/json";
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `agentshield-${id}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
