import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Segmented, Select } from "@/components/ui/form";
import { ErrorNote, CategoryName } from "@/components/common";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Meta, ModelSpec, RunConfig, TargetSpec } from "@/lib/types";

export function RunForm({
  meta,
  targets,
  models,
  preset,
  onStarted,
  compact,
}: {
  meta: Meta;
  targets: TargetSpec[];
  models: ModelSpec[];
  preset?: Partial<RunConfig>;
  onStarted: (id: string) => void;
  compact?: boolean;
}) {
  const [cfg, setCfg] = useState<Partial<RunConfig>>({
    target: "builtin",
    variant: "unsafe",
    mode: "monitor",
    policy: "default",
    brain: "simulated",
    categories: [],
    repeat: undefined,
    label: "",
    ...preset,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  const set = (p: Partial<RunConfig>) => setCfg((c) => ({ ...c, ...p }));
  const cats = Object.keys(meta.taxonomy.categories);
  const selected = cfg.categories ?? [];
  const builtin = cfg.target === "builtin";

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const body: Partial<RunConfig> = { ...cfg };
      if (!body.label) body.label = `${builtin ? cfg.variant : cfg.target} / ${cfg.mode}`;
      const r = await api.createRun(body);
      setWarn(r.warnings);
      onStarted(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="run-form">
      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "md:grid-cols-2")}>
        <div>
          <Label htmlFor="rf-target">Target</Label>
          <Select id="rf-target" value={cfg.target} onChange={(e) => set({ target: e.target.value })}>
            <option value="builtin">Built-in demo agents (sandbox)</option>
            {targets.map((t) => (
              <option key={t.name} value={t.name}>
                HTTP · {t.name}
              </option>
            ))}
          </Select>
        </div>
        {builtin && (
          <div>
            <Label>Agent configuration</Label>
            <Segmented
              ariaLabel="Agent variant"
              value={(cfg.variant ?? "unsafe") as "unsafe" | "partial" | "hardened"}
              onChange={(v) => set({ variant: v })}
              options={[
                { value: "unsafe", label: "Unsafe" },
                { value: "partial", label: "Partial fixes" },
                { value: "hardened", label: "Hardened" },
              ]}
            />
          </div>
        )}
        <div>
          <Label>Policy mode</Label>
          <Segmented
            ariaLabel="Policy mode"
            value={(cfg.mode ?? "monitor") as "monitor" | "enforce"}
            onChange={(v) => set({ mode: v })}
            options={[
              { value: "monitor", label: "Monitor" },
              { value: "enforce", label: "Enforce" },
            ]}
          />
          {!builtin && <p className="mt-1.5 text-xs text-muted">HTTP targets run in Monitor: Enforce needs the SDK or guard proxy inside their runtime.</p>}
        </div>
        <div>
          <Label htmlFor="rf-policy">Policy set</Label>
          <Select id="rf-policy" value={cfg.policy} onChange={(e) => set({ policy: e.target.value })}>
            {meta.policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} ({p.rules} rules)
              </option>
            ))}
          </Select>
        </div>
        {builtin && (
          <div>
            <Label htmlFor="rf-brain">Decision engine</Label>
            <Select id="rf-brain" value={cfg.brain} onChange={(e) => set({ brain: e.target.value, model: e.target.value === "llm" ? models[0]?.name : undefined })}>
              <option value="simulated">Simulated (offline, deterministic)</option>
              <option value="llm" disabled={models.length === 0}>
                Live model {models.length === 0 ? "(register a model first)" : ""}
              </option>
            </Select>
          </div>
        )}
        {builtin && cfg.brain === "llm" && (
          <div>
            <Label htmlFor="rf-model">Model</Label>
            <Select id="rf-model" value={cfg.model ?? ""} onChange={(e) => set({ model: e.target.value })}>
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} · {m.model}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="rf-repeat">Repeats per case</Label>
          <Input
            id="rf-repeat"
            type="number"
            min={1}
            max={meta.limits.max_repeat}
            placeholder="1"
            value={cfg.repeat ?? ""}
            onChange={(e) => set({ repeat: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
        <div>
          <Label htmlFor="rf-label">Label</Label>
          <Input id="rf-label" value={cfg.label ?? ""} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. before fixes" />
        </div>
      </div>
      <div>
        <Label>Categories {selected.length === 0 && <span className="normal-case text-muted">(all)</span>}</Label>
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => {
            const on = selected.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => set({ categories: on ? selected.filter((x) => x !== c) : [...selected, c] })}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on ? "border-amber bg-[#2b1e0a] text-amber" : "border-line text-muted hover:text-ink",
                )}
              >
                <CategoryName id={c} />
              </button>
            );
          })}
        </div>
      </div>
      {error && <ErrorNote message={error} />}
      {warn.map((w) => (
        <p key={w} className="text-xs text-amber">
          {w}
        </p>
      ))}
      <Button onClick={start} disabled={busy} data-testid="start-run">
        <Play className="h-4 w-4" /> {busy ? "Starting…" : "Start run"}
      </Button>
    </div>
  );
}
