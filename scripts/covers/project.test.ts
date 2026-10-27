// Spec: docs/specs/book-cover-fetcher.md, criteria 1, 2, 3, 4 (seed half) and 5.
// Guards on where the tool lives and what it may depend on. Each test first requires the tool to exist, so none of
// them can pass on the repo as it is today.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Every module specifier a file imports, requires or dynamically imports. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Resolves a specifier to a repo-relative path, or null for a package. `@/` is the src alias. */
function resolveLocal(from: string, specifier: string): string | null {
  const absolute = specifier.startsWith("@/")
    ? path.join(root, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  return absolute ? path.relative(root, absolute).replaceAll("\\", "/") : null;
}

const toolFiles = () => walk(path.join(root, "scripts", "covers")).filter((f) => /\.(ts|mjs)$/.test(f));
const toolSources = () => toolFiles().filter((f) => !/\.test\.ts$/.test(f) && !f.includes("__fixtures__"));

describe("#1 package.json", () => {
  it("has the covers:fetch script and adds no runtime dependency (sharp and tsx stay in devDependencies)", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts["covers:fetch"]).toBe("tsx scripts/covers/cli.ts");
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      ["@prisma/client", "next", "react", "react-dom", "server-only", "zod"].sort(),
    );
    expect(pkg.devDependencies).toHaveProperty("sharp");
    expect(pkg.devDependencies).toHaveProperty("tsx");
    expect(pkg.dependencies).not.toHaveProperty("sharp");
    expect(pkg.dependencies).not.toHaveProperty("tsx");
  });
});

const LAYOUT = [
  "cli.ts",
  "config.ts",
  "list.ts",
  "image.ts",
  "http.ts",
  "match.ts",
  "run.ts",
  "report.ts",
  "sources/manual.ts",
  "sources/openlibrary.ts",
  "sources/google-books.ts",
  "sources/commons.ts",
];

describe("#2 the app and the tool do not depend on each other", () => {
  it("the tool has the files the spec's Code layout lists (precondition for the checks below)", () => {
    const missing = LAYOUT.filter((file) => !existsSync(path.join(root, "scripts", "covers", file)));
    expect(missing).toEqual([]);
  });

  it("nothing under src/ imports from scripts/", () => {
    expect(existsSync(path.join(root, "scripts", "covers", "cli.ts")), "precondition: the tool exists").toBe(true);
    const offenders = walk(path.join(root, "src"))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .flatMap((file) =>
        specifiers(file)
          .filter((s) => resolveLocal(file, s)?.startsWith("scripts/"))
          .map((s) => `${path.relative(root, file)} imports ${s}`),
      );
    expect(offenders).toEqual([]);
  });

  it("no non-test file under scripts/covers/ imports from src/app or src/components", () => {
    const sources = toolSources();
    expect(sources.length, "precondition: the tool exists").toBeGreaterThan(0);
    const offenders = sources.flatMap((file) =>
      specifiers(file)
        .filter((s) => /^src\/(app|components)(\/|$)/.test(resolveLocal(file, s) ?? ""))
        .map((s) => `${path.relative(root, file)} imports ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("#3 ignore rules and configuration template", () => {
  it(".gitignore ignores .covers/", () => {
    expect(read(".gitignore")).toMatch(/^\/?\.covers\/?\s*$/m);
  });

  it(".env.example lists COVERS_CONTACT and GOOGLE_BOOKS_API_KEY with empty values", () => {
    const example = read(".env.example");
    expect(example).toMatch(/^COVERS_CONTACT=\s*$/m);
    expect(example).toMatch(/^GOOGLE_BOOKS_API_KEY=\s*$/m);
  });
});

describe("#4 the seed shares the slug function", () => {
  it("prisma/seed.ts imports slugify from src/lib/slug and defines no slug function of its own", () => {
    const seed = read("prisma/seed.ts");
    expect(seed).toMatch(/import\s*\{[^}]*\bslugify\b[^}]*\}\s*from\s*["']\.\.\/src\/lib\/slug(?:\.ts)?["']/);
    expect(seed).not.toMatch(/function\s+slugify\s*\(/);
    expect(seed).not.toMatch(/const\s+slugify\s*=/);
  });
});

describe("#5 the tools Vitest project", () => {
  it("vitest.config.ts has a `tools` project that runs scripts/**/*.test.ts without a database", async () => {
    const config = (await import("../../vitest.config")).default as {
      test?: { projects?: { test?: { name?: string; include?: string[]; globalSetup?: unknown } }[] };
    };
    const tools = config.test?.projects?.find((project) => project.test?.name === "tools");
    expect(tools, "a project named tools").toBeDefined();
    expect(tools?.test?.include).toContain("scripts/**/*.test.ts");
    expect(tools?.test?.globalSetup).toBeUndefined();
  });
});
