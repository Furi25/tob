import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

// Tests always run against the disposable database in .env.test, unless the caller overrides it.
const fileEnv = parseEnv(readFileSync(path.resolve(".env.test"), "utf8")) as Record<string, string>;
const testEnv: Record<string, string> = { ...fileEnv };
if (process.env.DATABASE_URL && /test/i.test(process.env.DATABASE_URL)) {
  testEnv.DATABASE_URL = process.env.DATABASE_URL;
}
process.env.DATABASE_URL = testEnv.DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve("src"),
      // `server-only` throws outside a React Server Components bundle; tests import server modules directly.
      "server-only": path.resolve("tests/support/server-only.ts"),
    },
  },
  test: {
    env: testEnv,
    // Integration tests share one Postgres database, so files never run concurrently.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"] },
      },
      {
        // The cover fetcher (docs/specs/book-cover-fetcher.md): no database, no network.
        extends: true,
        test: { name: "tools", include: ["scripts/**/*.test.ts"], testTimeout: 60_000 },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
