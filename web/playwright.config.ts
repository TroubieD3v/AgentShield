import { defineConfig } from "@playwright/test";
import path from "node:path";
import os from "node:os";

const port = Number(process.env.E2E_PORT ?? 8099);
const root = path.resolve(import.meta.dirname, "..");
const python =
  process.env.AGENTSHIELD_PY ?? (process.platform === "win32" ? path.join(root, ".venv", "Scripts", "python.exe") : "python");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PW_CHANNEL || undefined, // PW_CHANNEL=chrome reuses an installed Chrome
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `"${python}" -m agentshield.cli serve --port ${port}`,
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { AGENTSHIELD_HOME: path.join(os.tmpdir(), `agentshield-e2e-${process.pid}`), AGENTSHIELD_UI_DIR: path.join(root, "web", "dist") },
  },
});
