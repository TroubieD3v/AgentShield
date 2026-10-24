// Regenerates docs/screenshots/*.png and the frames used by make_gif.py.
// usage: PW_CHANNEL=chrome node scripts/screenshots.mjs   (needs `npm run build` first)
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const out = path.join(root, "docs", "screenshots");
const frames = path.join(out, "frames");
mkdirSync(frames, { recursive: true });
const port = 8098;
const base = `http://127.0.0.1:${port}`;
const python = process.env.AGENTSHIELD_PY ?? (process.platform === "win32" ? path.join(root, ".venv", "Scripts", "python.exe") : "python");

const server = spawn(python, ["-m", "agentshield.cli", "serve", "--port", String(port)], {
  cwd: root,
  env: { ...process.env, AGENTSHIELD_HOME: mkdtempSync(path.join(tmpdir(), "as-shots-")), AGENTSHIELD_UI_DIR: path.join(root, "web", "dist") },
  stdio: "ignore",
});
const stop = () => server.kill();
process.on("exit", stop);

async function api(p, init) {
  const r = await fetch(base + p, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function waitHealthy() {
  for (let i = 0; i < 80; i++) {
    try {
      await api("/api/health");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("server did not start");
}
async function run(cfg) {
  const { id } = await api("/api/runs", { method: "POST", body: JSON.stringify(cfg) });
  for (let i = 0; i < 200; i++) {
    const r = await api(`/api/runs/${id}`);
    if (r.status === "completed") return r;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error("run timeout");
}

await waitHealthy();
const before = await run({ variant: "unsafe", mode: "monitor", label: "Before fixes" });
const enforced = await run({ variant: "unsafe", mode: "enforce", label: "Unsafe + Enforce" });
const hardened = await run({ variant: "hardened", mode: "enforce", label: "Hardened + Enforce" });
await api("/api/baselines", { method: "POST", body: JSON.stringify({ name: "main", run_id: hardened.id }) });
const partial = await run({ variant: "partial", mode: "monitor", label: "After first fixes" });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(15000);
let frame = 0;
const shot = async (name, opts = {}) => page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
const gifFrame = async () => page.screenshot({ path: path.join(frames, `f${String(frame++).padStart(2, "0")}.png`) });

// dashboard (latest run = hardened; look at the unsafe one on the run page)
await page.goto(base + "/");
await page.getByRole("heading", { name: "Agents under test" }).waitFor();
await shot("dashboard", { fullPage: true });
await gifFrame();

// playground: Monitor, then Enforce
await page.goto(base + "/playground");
await page.getByTestId("run-attack").click();
await page.getByTestId("policy-decision-badge").getByText("Would block").waitFor();
await page.mouse.move(0, 0);
await shot("playground-monitor");
await gifFrame();
await page.getByRole("tab", { name: "Enforce" }).click();
await page.getByTestId("policy-decision-badge").getByText("Blocked").waitFor();
await shot("playground-enforce");
await gifFrame();
await page.evaluate(() => window.scrollTo(0, 650));
await page.waitForTimeout(200);
await shot("playground-trace");
await gifFrame();

// run detail with the baseline result
await page.goto(`${base}/runs/${before.id}`);
await page.getByTestId("cases").waitFor();
await shot("run");
await gifFrame();

// trace explorer on a mitigated case
const mitigated = enforced.cases.find((c) => c.scenario_id === "indirect-injection-email-001" && c.mitigated);
await page.goto(`${base}/traces/${mitigated.repeats[0].trace_id}`);
await page.getByRole("list", { name: "Agent execution timeline" }).waitFor();
await page.getByText("Unexpected tool call: send_email").scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 330));
await page.waitForTimeout(250);
await shot("trace");
await gifFrame();

// compare before / after
await page.goto(base + "/runs");
await page.getByLabel("Before (A)").selectOption(before.id);
await page.getByLabel("After (B)").selectOption(partial.id);
await page.getByTestId("compare").click();
await page.getByTestId("comparison").waitFor();
await page.getByTestId("comparison").scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 120));
await page.waitForTimeout(700);
await shot("compare");
await gifFrame();

// findings
await page.goto(base + "/findings");
await page.getByLabel("Run").selectOption(before.id);
await page.getByTestId("findings").waitFor();
await shot("findings");

// scenario library, policies, targets
await page.goto(base + "/scenarios");
await page.getByTestId("scenario-list").getByRole("button").first().click();
await page.getByTestId("scenario-detail").waitFor();
await shot("scenarios");
await page.goto(base + "/policies");
await page.getByTestId("rules").waitFor();
await page.getByTestId("policy-demo").getByText("Would block").waitFor();
await shot("policies");
await page.goto(base + "/targets");
await page.getByTestId("builtin-agents").waitFor();
await shot("targets");

// the same dashboard in the light theme and in Russian (dark is the default everywhere else)
await page.goto(base + "/");
await page.getByRole("heading", { name: "Agents under test" }).waitFor();
await page.locator("aside").getByTestId("theme-light").click();
await page.waitForTimeout(300);
await shot("dashboard-light", { fullPage: true });
await page.locator("aside").getByTestId("theme-dark").click();
await page.locator("aside").getByTestId("lang-ru").click();
await page.getByRole("heading", { name: "Тестируемые агенты" }).waitFor();
await page.waitForTimeout(300);
await shot("dashboard-ru", { fullPage: true });
await page.locator("aside").getByTestId("lang-en").click();

await browser.close();
stop();
console.log(`screenshots written to ${out}`);
