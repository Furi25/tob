// Harness for tests that drive a whole run (`runCovers`) against a fake network and a temporary output folder.
// See the assumed runCovers signature in tests/support/covers.ts.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, vi } from "vitest";
import {
  commonsReply,
  createFakeNet,
  failure,
  isCommonsApi,
  isGoogleSearch,
  isOlSearch,
  json,
  olSearch,
  ReportSchema,
  type Call,
  type Report,
} from "./covers";

export const KEY = "GB-SECRET-KEY-9f3a";
export const CONTACT_ADDRESS = "tests@example.org";

/** Returns a Response to answer, or undefined to let the next handler (and finally the default world) answer. */
export type Handler = (url: URL, call: Call, index: number) => Response | undefined | Promise<Response | undefined>;

/** What the world says when nothing else does: every search finds nothing, every other URL is a 404. All of it is clean. */
function fallback(url: URL): Response {
  if (isOlSearch(url)) return olSearch();
  if (isGoogleSearch(url)) return json({ kind: "books#volumes", totalItems: 0 });
  if (isCommonsApi(url)) return commonsReply([]);
  return failure(404);
}

export const world =
  (...handlers: Handler[]) =>
  async (url: URL, call: Call, index: number): Promise<Response> => {
    for (const handler of handlers) {
      const answer = await handler(url, call, index);
      if (answer) return answer;
    }
    return fallback(url);
  };

const directories: string[] = [];

/** Call once at the top of a test file. */
export function registerScenarioCleanup() {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
}

export function tempDir(prefix = "covers-test-") {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

export type Scenario = {
  list: string;
  respond?: (url: URL, call: Call, index: number) => Response | Promise<Response>;
  /** Google Books key. Default: none. */
  key?: string | null;
  contact?: string;
  force?: boolean;
  only?: string;
  /** Existing folder to reuse (for a second run). Default: a new temporary folder. */
  outDir?: string;
  /** Files to put in manual/ first: file name -> bytes. */
  manual?: Record<string, Buffer>;
  /** Files to put in images/ first: file name -> bytes. */
  images?: Record<string, Buffer>;
  /** Any other file to put under the output folder first: relative path -> bytes or text. */
  files?: Record<string, Buffer | string>;
  signal?: AbortSignal;
};

function put(root: string, relative: string, content: Buffer | string) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function capture() {
  const chunks: string[] = [];
  const take = (...args: unknown[]) => {
    chunks.push(args.map((a) => (typeof a === "string" ? a : a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : JSON.stringify(a))).join(" "));
  };
  for (const method of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, method).mockImplementation(take);
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => (take(String(chunk)), true)) as typeof process.stdout.write);
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => (take(String(chunk)), true)) as typeof process.stderr.write);
  return () => chunks.join("\n");
}

export async function runScenario(scenario: Scenario) {
  const outDir = scenario.outDir ?? tempDir();
  for (const [name, bytes] of Object.entries(scenario.manual ?? {})) put(outDir, `manual/${name}`, bytes);
  for (const [name, bytes] of Object.entries(scenario.images ?? {})) put(outDir, `images/${name}`, bytes);
  for (const [relative, content] of Object.entries(scenario.files ?? {})) put(outDir, relative, content);

  const net = createFakeNet(scenario.respond ?? world());
  const output = capture();
  const { runCovers } = await import("../../scripts/covers/run");

  let thrown: Error | null = null;
  let exitCode = -1;
  try {
    const result = await runCovers({
      listText: scenario.list,
      outDir,
      force: scenario.force ?? false,
      only: scenario.only,
      config: { contact: scenario.contact ?? CONTACT_ADDRESS, googleBooksApiKey: scenario.key ?? null },
      deps: { ...net.deps, signal: scenario.signal },
    });
    exitCode = result.exitCode;
  } catch (error) {
    thrown = error instanceof Error ? error : new Error(String(error));
  }

  const reportFile = path.join(outDir, "report.json");
  const reportText = existsSync(reportFile) ? readFileSync(reportFile, "utf8") : null;
  const report: Report | null = reportText === null ? null : ReportSchema.parse(JSON.parse(reportText));
  const entry = (slug: string) => {
    const found = report?.books.find((book) => book.slug === slug);
    if (!found) throw new Error(`no report entry for ${slug}; the report has ${JSON.stringify(report?.books.map((b) => b.slug))}`);
    return found;
  };

  return {
    outDir,
    exitCode,
    thrown,
    calls: net.calls,
    sleeps: net.sleeps,
    console: output(),
    report,
    reportText,
    entry,
    imagePath: (slug: string) => path.join(outDir, "images", `${slug}.png`),
    imageNames: () => (existsSync(path.join(outDir, "images")) ? readdirSync(path.join(outDir, "images")) : []),
    allFiles: () => walkNames(outDir),
    mtime: (relative: string) => statSync(path.join(outDir, relative)).mtimeMs,
    read: (relative: string) => readFileSync(path.join(outDir, relative)),
  };
}

function walkNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? walkNames(path.join(dir, item.name)).map((name) => `${item.name}/${name}`) : [item.name],
  );
}

export const callsTo = (calls: Call[], host: string) => calls.filter((call) => call.host === host);
