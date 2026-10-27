// Harness for tests that run the real CLI (`tsx scripts/content/cli.ts`) in a temporary working folder, so the tool's
// relative paths (docs/book-backlog.json, .content/) never touch the repository. The real network is blocked inside the
// child process by tests/support/no-network.mjs, which records every fetch attempt. See the assumptions in content.ts.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "vitest";
import { tempDir } from "./covers-run";
import { sha256, type Draft, type FactResult } from "./content";

export { tempDir, registerScenarioCleanup } from "./covers-run";

const root = process.cwd();
const CLI = path.join(root, "scripts", "content", "cli.ts");
const TSX = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const PRELOAD = pathToFileURL(path.join(root, "tests", "support", "no-network.mjs")).href;

export type Workspace = {
  dir: string;
  file(relative: string): string;
  /** Strings and Buffers are written as they are, anything else as pretty JSON. */
  write(relative: string, content: unknown): void;
  read(relative: string): string;
  json<T = unknown>(relative: string): T;
  exists(relative: string): boolean;
  /** Every file below the folder, as sorted forward-slash paths. */
  tree(): string[];
};

export function workspace(): Workspace {
  const dir = tempDir("content-test-");
  const file = (relative: string) => path.join(dir, ...relative.split("/"));
  const walk = (folder: string): string[] =>
    readdirSync(folder).flatMap((name) => {
      const full = path.join(folder, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  return {
    dir,
    file,
    write(relative, content) {
      mkdirSync(path.dirname(file(relative)), { recursive: true });
      writeFileSync(file(relative), typeof content === "string" || Buffer.isBuffer(content) ? content : JSON.stringify(content, null, 2));
    },
    read: (relative) => readFileSync(file(relative), "utf8"),
    json: <T>(relative: string) => JSON.parse(readFileSync(file(relative), "utf8")) as T,
    exists: (relative) => existsSync(file(relative)),
    tree: () => walk(dir).map((full) => path.relative(dir, full).replaceAll("\\", "/")).sort(),
  };
}

export type CliResult = ReturnType<typeof runCli>;

export function runCli(ws: Workspace, args: string[], env: Record<string, string | undefined> = {}) {
  expect(existsSync(CLI), "scripts/content/cli.ts exists").toBe(true);
  const log = path.join(tempDir("content-cli-log-"), "fetches.log");
  writeFileSync(log, "");

  const childEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) childEnv[key] = value;
  delete childEnv.CONTENT_CONTACT;
  childEnv.NODE_OPTIONS = `--import ${PRELOAD}`;
  childEnv.COVERS_TEST_FETCH_LOG = log;
  for (const [key, value] of Object.entries(env)) if (value !== undefined) childEnv[key] = value;

  const result = spawnSync(process.execPath, [TSX, "--tsconfig", path.join(root, "tsconfig.json"), CLI, ...args], {
    cwd: ws.dir,
    encoding: "utf8",
    timeout: 55_000,
    env: childEnv as NodeJS.ProcessEnv,
  });
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    text: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    fetches: readFileSync(log, "utf8").split("\n").filter(Boolean),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Fixtures written into a workspace
// ---------------------------------------------------------------------------------------------------------------

export type BacklogBook = { title: string; author: string; origin?: string; isbn?: string; notes?: string };

export const backlogOf = (...books: BacklogBook[]) => ({ version: 1, books: books.map((book) => ({ origin: "other", ...book })) });

export const BACKLOG_PATH = "docs/book-backlog.json";

export const putBacklog = (ws: Workspace, ...books: BacklogBook[]) => ws.write(BACKLOG_PATH, backlogOf(...books));

export const putDraft = (ws: Workspace, draft: Draft) => ws.write(`.content/drafts/${draft.slug}.json`, draft);

/** Writes a check report whose draft hashes are those of the draft files currently in the workspace. */
export function putReport(ws: Workspace, entries: { slug: string; facts: FactResult[] | null; errors?: unknown[]; warnings?: unknown[] }[]) {
  ws.write(".content/report.json", {
    generatedAt: new Date().toISOString(),
    drafts: entries.map((entry) => ({
      slug: entry.slug,
      draftSha256: sha256(readFileSync(ws.file(`.content/drafts/${entry.slug}.json`))),
      errors: entry.errors ?? [],
      warnings: entry.warnings ?? [],
      verification: entry.facts === null ? null : { facts: entry.facts },
    })),
  });
}

/** Everything in `after` that is not in `before`, and everything that went missing. */
export function treeChange(before: string[], after: string[]) {
  return { added: after.filter((name) => !before.includes(name)), removed: before.filter((name) => !after.includes(name)) };
}

export const nonEmptyLines = (text: string) => text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim() !== "");
