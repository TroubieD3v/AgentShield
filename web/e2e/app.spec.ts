import { expect, test, type APIRequestContext } from "@playwright/test";

async function startRun(request: APIRequestContext, body: Record<string, unknown>) {
  const r = await request.post("/api/runs", { data: body });
  expect(r.status()).toBe(202);
  const { id } = await r.json();
  for (let i = 0; i < 100; i++) {
    const run = await (await request.get(`/api/runs/${id}`)).json();
    if (run.status === "completed") return id as string;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error("run did not complete");
}

test.describe.configure({ mode: "serial" });

test("empty dashboard offers a first run and leads to results", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Run your first assessment")).toBeVisible();
  await page.getByRole("tab", { name: "Hardened" }).click();
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\/runs\/run_/);
  await expect(page.getByText("PASSED", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("cases")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Passed", { exact: true })).toBeVisible();
});

test("attack playground: Monitor records the violation, Enforce blocks it", async ({ page }) => {
  await page.goto("/playground");
  await page.getByTestId("run-attack").click();
  const badge = page.getByTestId("policy-decision-badge");
  await expect(badge).toHaveText("Would block");
  await expect(page.getByText("send_email()")).toBeVisible();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Enforce" }).click();
  await expect(badge).toHaveText("Blocked");
  await expect(page.getByText("Mock emails sent")).toBeVisible();
  await expect(page.getByText(/blocked by (policy|a security policy)/i).first()).toBeVisible();
});

test("playground hardened agent ignores the injection", async ({ page }) => {
  await page.goto("/playground");
  await page.getByRole("tab", { name: "Hardened" }).click();
  await page.getByTestId("run-attack").click();
  await expect(page.getByTestId("policy-decision-badge")).toHaveText("No violation");
  await expect(page.getByRole("paragraph").filter({ hasText: /treated them as untrusted data/ })).toBeVisible();
});

test("scenario library: filter, inspect, run one scenario", async ({ page }) => {
  await page.goto("/scenarios");
  await page.getByLabel("Category").selectOption("memory_poisoning");
  const list = page.getByTestId("scenario-list");
  await expect(list.getByRole("button")).toHaveCount(3);
  await list.getByRole("button", { name: /standing instruction/i }).click();
  const detail = page.getByTestId("scenario-detail");
  await expect(detail).toContainText("memory_clean");
  await expect(detail).toContainText("ASI06");
  await detail.getByRole("tab", { name: "Hardened" }).click();
  await page.getByTestId("run-scenario").click();
  await expect(page).toHaveURL(/\/runs\/run_/);
  await expect(page.getByTestId("cases")).toContainText("Inbound email plants a standing instruction", { timeout: 20_000 });
});

test("runs: compare unsafe against hardened and show regressions the other way", async ({ page, request }) => {
  const a = await startRun(request, { variant: "unsafe", label: "before", categories: ["indirect_prompt_injection", "tool_misuse", "benign_control"] });
  const b = await startRun(request, { variant: "hardened", label: "after", categories: ["indirect_prompt_injection", "tool_misuse", "benign_control"] });
  await page.goto("/runs");
  await page.getByLabel("Before (A)").selectOption(a);
  await page.getByLabel("After (B)").selectOption(b);
  await page.getByTestId("compare").click();
  const cmp = page.getByTestId("comparison");
  await expect(cmp.getByTestId("regression-count")).toHaveText("0 regression(s)");
  await expect(cmp).toContainText("improved");
  await page.getByLabel("Before (A)").selectOption(b);
  await page.getByLabel("After (B)").selectOption(a);
  await page.getByTestId("compare").click();
  await expect(cmp).toContainText(/\b[1-9]\d* regression\(s\)/);
});

test("findings and trace explorer tell the story of one violation", async ({ page, request }) => {
  const id = await startRun(request, { variant: "unsafe", mode: "enforce", label: "enforced", scenarios: ["indirect-injection-email-001", "tool-misuse-delete-001"] });
  await page.goto(`/runs/${id}`);
  await page.getByRole("button", { name: /Untrusted document triggers an outbound email/ }).first().click();
  await expect(page.getByText("tool_not_called").first()).toBeVisible();
  await page.getByRole("link", { name: "Open trace" }).first().click();
  await expect(page).toHaveURL(/\/traces\/trace_/);
  const tl = page.getByRole("list", { name: "Agent execution timeline" });
  await expect(tl).toContainText("Unexpected tool call: send_email");
  await expect(tl).toContainText("Blocked before execution");
  await expect(tl).toContainText("Policy enforcement");
  await expect(tl).toContainText("untrusted");
  await page.goto("/findings");
  await expect(page.getByTestId("findings")).toHaveCount(0); // enforcement mitigated everything
  await expect(page.getByText("No findings")).toBeVisible();
});

test("findings show remediation for a confirmed violation", async ({ page, request }) => {
  const id = await startRun(request, { variant: "unsafe", mode: "monitor", label: "monitor only", scenarios: ["indirect-injection-chain-003"] });
  await page.goto("/findings");
  await page.getByLabel("Run").selectOption(id);
  const f = page.getByTestId("findings");
  await expect(f).toContainText("confirmed by observed action");
  await expect(f).toContainText("Remediation");
  await expect(f).toContainText("LLM01");
});

test("policies: schema validation, custom policy, live demo", async ({ page }) => {
  await page.goto("/policies");
  await expect(page.getByTestId("rules")).toContainText("AS-P001-unauthorized-email");
  const demo = page.getByTestId("policy-demo");
  await expect(demo.getByTestId("policy-decision-badge")).toHaveText("Would block");
  await demo.getByRole("tab", { name: "Enforce" }).click();
  await expect(demo.getByTestId("policy-decision-badge")).toHaveText("Blocked");
  const editor = page.getByLabel("Policy YAML");
  await editor.fill("id: broken\nrules:\n  - id: r\n    when: {made_up: true}\n");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText(/made_up/)).toBeVisible();
  await editor.fill("id: e2e-policy\nrules:\n  - id: r1\n    tools: [send_email]\n    when: {unauthorized: true}\n");
  await page.getByRole("button", { name: "Save as new policy" }).click();
  await expect(page.getByText('Saved as "e2e-policy".')).toBeVisible();
  await expect(page.getByLabel("Policy", { exact: true })).toContainText("e2e-policy");
});

test("targets: built-in agents shown, outbound allowlist enforced", async ({ page }) => {
  await page.goto("/targets");
  await expect(page.getByTestId("builtin-agents")).toContainText("Document Assistant");
  await expect(page.getByTestId("builtin-agents")).toContainText("Office Assistant");
  await expect(page.getByTestId("builtin-agents")).toContainText("Research Agent");
  await page.getByLabel("Endpoint URL").fill("http://example.com/chat");
  await page.getByRole("button", { name: "Register target" }).click();
  await expect(page.getByRole("alert")).toContainText("not in the allowlist");
  await page.getByLabel("Endpoint URL").fill("http://169.254.169.254/latest");
  await page.getByRole("button", { name: "Register target" }).click();
  await expect(page.getByRole("alert")).toContainText("always denied");
  await page.getByLabel("Endpoint URL").fill("http://localhost:9000/chat");
  await page.getByRole("button", { name: "Register target" }).click();
  await expect(page.getByText("telemetry: none")).toBeVisible();
});

test("reports download as HTML, JSON, SARIF and Markdown", async ({ page, request }) => {
  const id = await startRun(request, { variant: "unsafe", scenarios: ["indirect-injection-chain-003"], label: "dl" });
  await page.goto(`/runs/${id}`);
  for (const [fmt, ext] of [["html", "html"], ["json", "json"], ["sarif", "sarif"], ["md", "md"]]) {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: `Download ${fmt} report` }).click()]);
    expect(dl.suggestedFilename()).toBe(`agentshield-${id}.${ext}`);
  }
});

test("api rejects foreign Host headers (DNS rebinding)", async ({ request }) => {
  const r = await request.get("/api/health", { headers: { host: "evil.example.com" } });
  expect(r.status()).toBe(400);
});

test("sidebar exposes all eight sections", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Dashboard", "Targets & Models", "Scenario Library", "Attack Playground", "Test Runs", "Trace Explorer", "Findings", "Policies & Reports"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
});
