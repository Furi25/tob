import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

// The app server and the test helpers must share the disposable database in .env.test.
const fileEnv = parseEnv(readFileSync(path.resolve(".env.test"), "utf8")) as Record<string, string>;
if (!process.env.DATABASE_URL || !/test/i.test(process.env.DATABASE_URL)) {
  process.env.DATABASE_URL = fileEnv.DATABASE_URL;
}
const databaseUrl = process.env.DATABASE_URL ?? "";

const PORT = 3100;
const production = process.env.E2E_PRODUCTION === "1";

export default defineConfig({
  testDir: "tests/e2e",
  // Tests change shared database state, so everything runs in one worker.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: production ? `npm run build && npm run start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { DATABASE_URL: databaseUrl },
  },
});
