// Command line entry: `npm run covers:fetch -- <list-file> [--out <dir>] [--force] [--only <slug>]`.
// Exit codes: 0 all fine, 1 some book missing or failed, 2 the command or its input is wrong, 130 stopped with Ctrl+C.
// Nothing outside scripts/covers/ imports this tool, and it imports nothing from src/ except src/lib/slug.ts.
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { loadConfig } from "./config";
import { runCovers } from "./run";

const USAGE = "usage: npm run covers:fetch -- <list-file> [--out <dir>] [--force] [--only <slug>]";

/** The repository root: two folders above this file, which is where `npm run` starts the script from. */
function repositoryRoot(): string {
  const entry = process.argv[1];
  return entry ? path.resolve(path.dirname(entry), "..", "..") : process.cwd();
}

/** Resolves a path through symlinks as far as it exists, so `..` and links can't hide where it really points. */
function resolveReal(target: string): string {
  const absolute = path.resolve(target);
  const missing: string[] = [];
  let current = absolute;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return absolute;
    missing.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathSync(current), ...missing);
}

function isInside(folder: string, target: string): boolean {
  const relative = path.relative(folder, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function fail(message: string): number {
  console.error(message);
  return 2;
}

async function main(): Promise<number> {
  let values: { out?: string; force?: boolean; only?: string };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      strict: true,
      options: {
        out: { type: "string" },
        force: { type: "boolean" },
        only: { type: "string" },
      },
    }));
  } catch (error) {
    return fail(`${error instanceof Error ? error.message : "bad arguments"}\n${USAGE}`);
  }
  if (positionals.length !== 1) return fail(`expected exactly one list file\n${USAGE}`);
  const [listFile] = positionals;

  const root = repositoryRoot();
  // A .env at the repository root may hold COVERS_CONTACT and GOOGLE_BOOKS_API_KEY. Variables already set win.
  const envFile = path.join(root, ".env");
  if (existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      return fail("cannot read the .env file");
    }
  }

  let listText: string;
  try {
    listText = await readFile(listFile, "utf8");
  } catch {
    return fail("cannot read the list file");
  }

  const config = loadConfig(process.env);
  if (!config.ok) return fail(config.errors.join("\n"));

  const outDir = path.resolve(values.out ?? path.join(root, ".covers"));
  const realOut = resolveReal(outDir);
  for (const forbidden of ["src", "public"]) {
    if (isInside(resolveReal(path.join(root, forbidden)), realOut)) {
      return fail(`--out must not be inside ${forbidden}/: the app must not ship these images`);
    }
  }

  // First Ctrl+C: finish the book in progress, write the report, exit 130. Second Ctrl+C: leave at once.
  const controller = new AbortController();
  process.on("SIGINT", () => {
    if (controller.signal.aborted) process.exit(130);
    console.error("stopping after the current book (Ctrl+C again to stop now)");
    controller.abort();
  });

  const { exitCode } = await runCovers({
    listText,
    outDir,
    force: values.force ?? false,
    only: values.only,
    config: config.config,
    deps: { signal: controller.signal },
  });
  return exitCode;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    console.error("the tool stopped because of an unexpected error");
    process.exitCode = 1;
  },
);
