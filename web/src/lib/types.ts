export type Status = "PASS" | "FAIL" | "SUSPICIOUS" | "INCONCLUSIVE" | "ERROR";
export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface Violation {
  rule_id: string;
  severity: Severity;
  reason: string;
  effect: string;
  owasp: string[];
}
export interface PolicyDecision {
  decision: "allow" | "block" | "would_block" | "audit";
  mode: "monitor" | "enforce";
  violations: Violation[];
  blocked: boolean;
}
export interface TraceEvent {
  id: string;
  trace_id: string;
  seq: number;
  ts: number;
  type: string;
  title: string;
  input: unknown;
  output: unknown;
  duration_ms: number;
  status: string;
  executed: boolean | null;
  untrusted: boolean;
  policy: PolicyDecision | null;
  attributes: Record<string, unknown>;
}
export interface Trace {
  trace_id: string;
  events: TraceEvent[];
  started_at: number;
}
export interface Evidence {
  event_id: string | null;
  seq: number | null;
  summary: string;
}
export interface AssertionResult {
  type: string;
  status: Status;
  message: string;
  level: string;
  evidence: Evidence[];
  params: Record<string, unknown>;
}
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  estimated: boolean;
  cost_usd: number | null;
}
export interface RepeatResult {
  index: number;
  status: Status;
  assertions: AssertionResult[];
  trace_id: string | null;
  error: string | null;
  final_response: string;
  iterations: number;
  tool_calls: number;
  attempted_violations: number;
  effective_violations: number;
  blocked_attempts: number;
  usage: Usage;
  duration_ms: number;
}
export interface CaseResult {
  id: string;
  scenario_id: string;
  scenario_version: string;
  variant: Record<string, string>;
  name: string;
  category: string;
  severity: Severity;
  owasp: string[];
  agent: string;
  mode: string;
  policy: string | null;
  model: string;
  status: Status;
  pass_rate: number;
  repeats: RepeatResult[];
  mitigated: boolean;
  remediation: string;
}
export interface CategoryStat {
  total: number;
  score: number;
  coverage: number;
  pass: number;
  fail: number;
  suspicious: number;
  inconclusive: number;
}
export interface Summary {
  total: number;
  counts: Record<Status, number>;
  score: number;
  coverage: number;
  mitigated: number;
  by_category: Record<string, CategoryStat>;
  by_agent: Record<string, CategoryStat>;
  policy_violations_attempted: number;
  policy_violations_effective: number;
  tokens: number;
  cost_usd: number | null;
}
export interface RunConfig {
  target: string;
  variant: string;
  mode: string;
  policy: string;
  brain: string;
  model: string | null;
  repeat: number | null;
  seed: string;
  scenarios: string[];
  categories: string[];
  agents: string[];
  label: string;
}
export interface FindingRepeat {
  index: number;
  status: Status;
  trace_id: string | null;
  summary: string;
}
export interface Finding {
  id: string;
  run_id: string;
  case_key: string;
  scenario_id: string;
  title: string;
  severity: Severity;
  category: string;
  status: Status;
  owasp: string[];
  agent: string;
  description: string;
  evidence: Evidence[];
  remediation: string;
  trace_id: string | null;
  evidence_repeat: number;
  repeats: FindingRepeat[];
  confidence: string;
}
export interface Run {
  id: string;
  config: RunConfig;
  status: string;
  started_at: number;
  finished_at: number | null;
  cases: CaseResult[];
  summary: Summary;
  progress: { done: number; total: number };
  error: string | null;
  findings: Finding[];
  agentshield_version: string;
}
export interface RunListItem {
  id: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  label: string;
  variant: string;
  mode: string;
  score: number;
}
export interface ScenarioDef {
  id: string;
  name: string;
  version: string;
  category: string;
  severity: Severity;
  owasp: string[];
  agent: string;
  description: string;
  remediation: string;
  source: string;
  steps: Record<string, unknown>[];
  assertions: Record<string, unknown>[];
  repeat: number;
  variants: Record<string, string>[];
}
export interface AgentInfo {
  name: string;
  title: string;
  description: string;
  tools: string[];
  variants: { variant: string; hardening: Record<string, boolean> }[];
}
export interface PolicyRule {
  id: string;
  description: string;
  severity: Severity;
  tools: string[];
  when: Record<string, unknown>;
  when_any: Record<string, unknown>;
  effect: string;
  owasp: string[];
  remediation: string;
}
export interface Policy {
  id: string;
  version: string;
  description: string;
  trusted_domains: string[];
  allowed_fetch_domains: string[];
  rules: PolicyRule[];
}
export interface Meta {
  version: string;
  auth_required: boolean;
  queue: string;
  database: string;
  agents: AgentInfo[];
  policies: { id: string; description: string; rules: number }[];
  taxonomy: {
    llm: { edition: string; items: Record<string, { title: string }> };
    agentic: { edition: string; items: Record<string, { title: string }> };
    categories: Record<string, string>;
  };
  limits: { max_repeat: number; max_scenarios: number };
  allowed_hosts: string[];
  formats: string[];
}
export interface Dashboard {
  scenario_definitions: number;
  scenario_cases: number;
  runs_total: number;
  last_run: { id: string; label: string; summary: Summary; findings: number; config: RunConfig } | null;
  trend: { id: string; label: string; score: number; started_at: number }[];
  baselines: { name: string; run_id: string; created_at: number }[];
}
export interface Comparison {
  a: { id: string; label: string; score: number };
  b: { id: string; label: string; score: number };
  delta_score: number;
  categories: { category: string; a: number | null; b: number | null }[];
  regressions: { key: string; name: string; category: string; severity: string; from: Status; to: Status }[];
  improvements: { key: string; name: string; category: string; severity: string; from: Status; to: Status }[];
  unchanged: number;
  passed?: boolean;
}
export interface PlaygroundResult {
  trace: Trace;
  response: string;
  assertions: AssertionResult[];
  world: {
    outbox: { recipient: string; subject: string; body: string }[];
    deleted_files: string[];
    memory: { key: string; value: string; source: string; tainted: boolean }[];
    calendar: { title: string; attendees: string[] }[];
    sinks: { sink: string; payload: string; dangerous: boolean; reason: string }[];
  };
  stats: Record<string, number>;
}
export interface TargetSpec {
  name: string;
  kind: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  request_template: Record<string, unknown>;
  response_path: string;
  tool_calls_path: string | null;
  telemetry: string;
  canaries: Record<string, string>;
  timeout_s: number;
  description: string;
}
export interface ModelSpec {
  name: string;
  kind: string;
  base_url: string;
  model: string;
  api_key_env: string | null;
  price_in_per_1m: number | null;
  price_out_per_1m: number | null;
  timeout_s: number;
  max_tokens: number;
  temperature: number;
  description: string;
}
