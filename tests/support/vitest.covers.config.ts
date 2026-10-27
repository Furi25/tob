// Runs the cover-fetcher tests (scripts/**/*.test.ts) before the real `tools` project exists in vitest.config.ts.
//   npx vitest run --config tests/support/vitest.covers.config.ts
// Spec: docs/specs/book-cover-fetcher.md, criterion 5. Once the implementer adds that project, `npm run test` runs these
// files and this config can be deleted. No database is needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": `${root}src`,
      "server-only": `${root}tests/support/server-only.ts`,
    },
  },
  test: {
    name: "covers",
    include: ["scripts/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
