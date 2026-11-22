"""Self-contained HTML report (no external assets)."""

from __future__ import annotations

import json
import time

from jinja2 import Environment, select_autoescape

from ..evaluation.scoring import build_findings
from ..results import SuiteRun

TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentShield report {{ run.id }}</title>
<style>
:root{color-scheme:dark;--bg:#191b1e;--panel:#1f2226;--panel2:#24272c;--line:#2f333a;--line2:#25282d;--text:#d5d7da;--muted:#8d939a;--amber:#d0a866;--blue:#8fb4d8;--red:#d98577;--green:#94b08e;--violet:#9ba8b5}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.5 'IBM Plex Sans',system-ui,'Segoe UI',sans-serif;font-feature-settings:"tnum"}
main{max-width:1080px;margin:0 auto;padding:28px 20px 72px}h1{font-size:20px;font-weight:600;margin:0 0 4px}h2{font-size:14px;font-weight:600;margin:28px 0 8px;color:var(--text)}
.muted{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;margin:16px 0;background:var(--line);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.tile{background:var(--panel);padding:8px 12px}.tile span{font-size:12px}.tile b{display:block;font:500 18px 'IBM Plex Mono',ui-monospace,Consolas,monospace}
.badge{display:inline-block;border-radius:3px;padding:0 6px;font-size:11px;font-weight:500;line-height:18px;border:1px solid}
.PASS{color:var(--green);border-color:#4c5c49;background:#232b23}.FAIL{color:var(--red);border-color:#6e4740;background:#2e2321}
.SUSPICIOUS{color:var(--amber);border-color:#6c5a39;background:#2d2820}.INCONCLUSIVE,.ERROR{color:var(--muted);border-color:var(--line);background:var(--panel2)}
.sev-critical,.sev-high{color:var(--red)}.sev-medium{color:var(--amber)}.sev-low,.sev-info{color:var(--muted)}
.bar{display:inline-block;width:70%;height:6px;background:#2b2f35;overflow:hidden;vertical-align:middle}.bar i{display:block;height:100%;background:var(--blue)}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line)}th,td{padding:5px 8px;text-align:left;border-bottom:1px solid var(--line2);vertical-align:top}th{color:var(--muted);font-weight:500;font-size:12px;background:var(--panel2);border-bottom-color:var(--line)}
details{background:var(--panel);border:1px solid var(--line);border-radius:4px;margin:6px 0;padding:8px 12px}summary{cursor:pointer;font-weight:500}
code,pre{font:12px/1.5 'IBM Plex Mono',ui-monospace,Consolas,monospace;background:var(--bg);border-radius:3px}pre{padding:8px 10px;overflow:auto;white-space:pre-wrap;word-break:break-word;border:1px solid var(--line2)}code{padding:0 4px}
.tl{list-style:none;margin:8px 0;padding:0}.tl li{display:grid;grid-template-columns:34px 1fr;gap:8px;padding:4px 0;border-bottom:1px solid var(--line2)}
.ev-violation,.ev-blocked{border-left:2px solid var(--red);padding-left:8px}.ev-blocked .t{color:var(--green)}
.warn{border:1px solid #6c5a39;background:#2d2820;color:var(--amber);padding:8px 12px;border-radius:4px;margin:12px 0}
</style></head><body><main>
<h1>AgentShield report</h1>
<div class="muted">{{ label }} · run <code>{{ run.id }}</code> · {{ when }} · v{{ run.agentshield_version }}</div>
<div class="muted">mode <b>{{ cfg.mode }}</b> · policy <code>{{ cfg.policy }}</code> · brain <code>{{ cfg.brain }}</code> · variant <code>{{ cfg.variant }}</code></div>
<div class="grid">
 <div class="tile"><span class="muted">Resilience score</span><b>{{ s.score }}</b></div>
 <div class="tile"><span class="muted">Conclusive coverage</span><b>{{ (s.coverage*100)|round|int }}%</b></div>
 <div class="tile"><span class="muted">Findings</span><b>{{ findings|length }}</b></div>
 <div class="tile"><span class="muted">Violations (attempted / effective)</span><b>{{ s.policy_violations_attempted }} / {{ s.policy_violations_effective }}</b></div>
 <div class="tile"><span class="muted">Mitigated by defenses</span><b>{{ s.mitigated }}</b></div>
 <div class="tile"><span class="muted">Tokens</span><b>{{ s.tokens }}</b></div>
</div>
<p>{% for k in ['PASS','FAIL','SUSPICIOUS','INCONCLUSIVE','ERROR'] %}<span class="badge {{k}}">{{ k }} {{ s.counts.get(k,0) }}</span> {% endfor %}</p>
{% if s.counts.get('INCONCLUSIVE',0) + s.counts.get('ERROR',0) %}<div class="warn">Some cases are INCONCLUSIVE or ERROR: the target did not expose the telemetry needed to confirm the absence of a violation. They are not counted as passes.</div>{% endif %}

<h2>Categories</h2>
<table><tr><th>Category</th><th style="width:34%">Score</th><th>Pass</th><th>Fail</th><th>Susp.</th><th>Inconcl.</th></tr>
{% for cat, v in s.by_category|dictsort %}<tr><td>{{ cat }}</td><td><div class="bar"><i style="width:{{ v.score }}%"></i></div> <span class="muted">{{ v.score }}</span></td><td>{{ v.pass }}</td><td>{{ v.fail }}</td><td>{{ v.suspicious }}</td><td>{{ v.inconclusive }}</td></tr>{% endfor %}</table>

<h2>Findings ({{ findings|length }})</h2>
{% for f in findings %}
<details><summary><span class="badge {{ f.status.value }}">{{ f.status.value }}</span> <span class="sev-{{ f.severity.value }}">{{ f.severity.value|upper }}</span> · {{ f.title }} <span class="muted">· {{ f.id }}</span></summary>
 <p class="muted">{{ f.category }} · agent <code>{{ f.agent }}</code>{% if f.owasp %} · {{ f.owasp|join(', ') }}{% endif %}</p>
 <p>{{ f.description }}</p>
 {% if f.repeats|length > 1 %}<p class="muted">Repeats: {% for r in f.repeats %}<span class="badge {{ r.status.value }}">#{{ r.index + 1 }} {{ r.status.value }}</span> {% endfor %}(evidence is from repeat #{{ f.evidence_repeat + 1 }})</p>{% endif %}
 {% if f.evidence %}<p><b>Evidence</b></p><ul>{% for e in f.evidence[:6] %}<li>#{{ e.seq }} <code>{{ e.summary }}</code></li>{% endfor %}</ul>{% endif %}
 {% if f.remediation %}<p><b>Remediation:</b> {{ f.remediation }}</p>{% endif %}
 {% set tr = traces.get(f.trace_id) %}{% if tr %}<p><b>Agent execution trace</b></p><ul class="tl">
 {% for e in tr.events if e.type.value not in ['model_generation'] %}<li class="ev-{{ e.status }}"><span class="muted">#{{ e.seq }}</span><div><b>{{ e.title }}</b> <span class="muted">{{ e.type.value }}</span>{% if e.type.value=='tool_call' %} <span class="badge {{ 'PASS' if e.executed else 'FAIL' }}">{{ 'executed' if e.executed else 'blocked' }}</span>{% endif %}
 {% if e.input %}<div><code>{{ e.input|tojson|truncate(220) }}</code></div>{% endif %}{% if e.policy and e.policy.violations %}<div class="t">{{ e.policy.decision }}: {% for v in e.policy.violations %}{{ v.rule_id }} — {{ v.reason }}{% endfor %}</div>{% endif %}</div></li>{% endfor %}</ul>{% endif %}
</details>
{% else %}<p class="muted">No confirmed or suspicious findings.</p>{% endfor %}

<h2>All cases ({{ run.cases|length }})</h2>
<table><tr><th>Status</th><th>Case</th><th>Severity</th><th>Agent</th><th>Pass rate</th></tr>
{% for c in run.cases %}<tr><td><span class="badge {{ c.status.value }}">{{ c.status.value }}</span>{% if c.mitigated %} <span class="muted" title="passed because a defense blocked an attempt">★</span>{% endif %}</td><td>{{ c.name }}<div class="muted">{{ c.category }}</div></td><td class="sev-{{ c.severity.value }}">{{ c.severity.value }}</td><td><code>{{ c.agent }}</code></td><td>{{ (c.pass_rate*100)|round|int }}%</td></tr>{% endfor %}</table>
<p class="muted">★ passed only because policy or an application defense blocked the attempt. Secrets are redacted; leak tests use synthetic canary tokens only.</p>
</main></body></html>"""

_env = Environment(autoescape=select_autoescape(default=True), trim_blocks=True, lstrip_blocks=True)
_env.filters["tojson"] = lambda v: json.dumps(v, default=str)
_tpl = _env.from_string(TEMPLATE)


def render_html(run: SuiteRun) -> str:
    traces = {t.trace_id: t for c in run.cases for t in c.traces}
    cfg = run.config
    return _tpl.render(
        run=run,
        cfg=cfg,
        s=run.summary,
        findings=build_findings(run),
        traces=traces,
        label=cfg.label or f"{cfg.target}:{cfg.variant}",
        when=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(run.started_at)),
    )
