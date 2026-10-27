// Spec: docs/specs/book-cover-fetcher.md, criteria 41 and 42 at the command line: exit code 2 and zero requests.
// The CLI runs as a real child process (`tsx scripts/covers/cli.ts`). The real network is blocked inside it by a preload
// that records every fetch attempt, so a tool that wrongly goes online fails the test instead of calling a service.
// Not covered here: exit codes 0, 1 and 130 (they need a network or a signal; the run tests cover the logic), and a
// COVERS_CONTACT that is entirely unset (a repo-root .env may legitimately supply it).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { tempDir, registerScenarioCleanup } from "../../tests/support/covers-run";

registerScenarioCleanup();

const root = process.cwd();

// If the tool wrongly accepts one of the forbidden --out folders below, do not leave junk inside the app.
const FORBIDDEN_LEFTOVERS = ["src/covers-test-out", "public/covers-test-out", "src/covers-test-abs", "src/covers-test-dotdot"];
afterEach(() => {
  for (const leftover of FORBIDDEN_LEFTOVERS) rmSync(path.join(root, leftover), { recursive: true, force: true });
});
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const preload = pathToFileURL(path.join(root, "tests", "support", "no-network.mjs")).href;

const GOOD_LIST = "The Hobbit | J.R.R. Tolkien\nDune | Frank Herbert\n";

function cli(args: string[], env: Record<string, string> = {}) {
  const logDir = tempDir("covers-cli-log-");
  const log = path.join(logDir, "fetches.log");
  writeFileSync(log, "");
  const result = spawnSync(process.execPath, [tsx, "scripts/covers/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 50_000,
    env: {
      ...process.env,
      COVERS_CONTACT: "tests@example.org",
      GOOGLE_BOOKS_API_KEY: "",
      NODE_OPTIONS: `--import ${preload}`,
      COVERS_TEST_FETCH_LOG: log,
      ...env,
    },
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    text: `${result.stdout}\n${result.stderr}`,
    fetches: readFileSync(log, "utf8").split("\n").filter(Boolean),
  };
}

function listFile(content: string, name = "books.txt") {
  const file = path.join(tempDir("covers-cli-list-"), name);
  writeFileSync(file, content);
  return file;
}

function expectRefused(result: ReturnType<typeof cli>) {
  expect(result.code, `exit code (output: ${result.text.slice(0, 500)})`).toBe(2);
  expect(result.fetches).toEqual([]);
}

describe("the CLI exists (precondition for everything below)", () => {
  it("scripts/covers/cli.ts is there", () => {
    expect(existsSync(path.join(root, "scripts", "covers", "cli.ts"))).toBe(true);
  });
});

describe("#42 exit code 2 and zero requests", () => {
  it("for a missing list file argument", () => {
    expectRefused(cli([]));
  });

  it("for a list file that does not exist", () => {
    expectRefused(cli([path.join(tempDir(), "nope.txt"), "--out", tempDir()]));
  });

  it("for a list file that cannot be read (a folder)", () => {
    expectRefused(cli([tempDir("covers-cli-folder-"), "--out", tempDir()]));
  });

  it("for a list with errors, and names the lines", () => {
    const result = cli([listFile("Just A Title\nDune | Frank Herbert\nDune! | Other Author\n"), "--out", tempDir()]);
    expectRefused(result);
    expect(result.text).toMatch(/\b1\b/);
    expect(result.text).toMatch(/\b3\b/);
  });

  it("for an unknown flag", () => {
    expectRefused(cli([listFile(GOOD_LIST), "--bogus", "--out", tempDir()]));
  });

  it("for two positional arguments", () => {
    expectRefused(cli([listFile(GOOD_LIST), listFile(GOOD_LIST, "second.txt"), "--out", tempDir()]));
  });

  it("for --only with no value", () => {
    expectRefused(cli([listFile(GOOD_LIST), "--out", tempDir(), "--only"]));
  });

  it("for an unknown --only slug", () => {
    expectRefused(cli([listFile(GOOD_LIST), "--out", tempDir(), "--only", "no-such-book"]));
  });

  it("for an --out that cannot be written (below a file)", () => {
    const base = tempDir();
    const blocker = path.join(base, "i-am-a-file");
    writeFileSync(blocker, "x");
    expectRefused(cli([listFile(GOOD_LIST), "--out", path.join(blocker, "covers")]));
  });

  it.each([
    ["src/", "src/covers-test-out"],
    ["public/", "public/covers-test-out"],
    ["src/ (the folder itself)", "src"],
    ["src/ (as an absolute path)", path.join(root, "src", "covers-test-abs")],
    ["src/ (with a .. in the path)", "docs/../src/covers-test-dotdot"],
  ])("for an --out inside %s, and creates nothing there", (_label, out) => {
    expectRefused(cli([listFile(GOOD_LIST), "--out", out]));
    for (const leftover of ["src/covers-test-out", "public/covers-test-out", "src/covers-test-abs", "src/covers-test-dotdot"]) {
      expect(existsSync(path.join(root, leftover)), leftover).toBe(false);
    }
  });
});

describe("#41 configuration problems are exit code 2 with zero requests", () => {
  it.each([
    ["a blank COVERS_CONTACT", ""],
    ["a COVERS_CONTACT that is neither an email address nor a URL", "not a contact"],
    ["an http: COVERS_CONTACT", "http://example.org/contact"],
  ])("for %s", (_label, contact) => {
    const out = tempDir();
    mkdirSync(out, { recursive: true });
    expectRefused(cli([listFile(GOOD_LIST), "--out", out], { COVERS_CONTACT: contact }));
  });

  it("without echoing the API key", () => {
    const result = cli([listFile(GOOD_LIST), "--out", tempDir()], { COVERS_CONTACT: "not a contact", GOOGLE_BOOKS_API_KEY: "CLI-SECRET-KEY-77" });
    expectRefused(result);
    expect(result.text).not.toContain("CLI-SECRET-KEY-77");
  });
});
