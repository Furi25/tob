// Preloaded into the CLI child process by scripts/covers/cli.test.ts (node --import). It replaces the global fetch with
// one that records the attempt and fails, so a CLI run that should make no request can never reach the real network.
import { appendFileSync } from "node:fs";

globalThis.fetch = async (input) => {
  appendFileSync(process.env.COVERS_TEST_FETCH_LOG, `${String(input instanceof Request ? input.url : input)}\n`);
  throw new TypeError("the real network is blocked in tests");
};
