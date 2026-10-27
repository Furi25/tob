// Spec: docs/specs/book-content-tool.md, criteria 20 (committed backlog), 38 (isolation), 39 (imports) and 40 (repository config);
// plus the file layout and the npm script. Criterion 40's `npm run typecheck` and `npm run lint` are not run from here.
//
// AMENDED by docs/specs/content-import.md (Risks, "Breaking, in tests and specs"), the only reason these tests changed:
//   - #20: the backlog has 30 entries, the 30th being Anathem / Neal Stephenson / other (content-import criterion 17);
//   - #38: only src/ and tests/e2e/ may not know the tool; prisma/seed.ts may read the file (content-import criterion 16),
//     and the scan also covers BOOK_CONTENT_FILE.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { slugify } from "../../src/lib/slug";
import { nonEmptyLines, runCli, treeChange, registerScenarioCleanup, workspace } from "../../tests/support/content-run";
import { ANATHEM } from "../../tests/support/content-import";

registerScenarioCleanup();

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(path.join(root, ...parts), "utf8");

// Copied from prisma/seed.ts on purpose: this test imports nothing from the seed.
const CLASSICS: [string, string][] = [
  ["The Hobbit", "J.R.R. Tolkien"],
  ["1984", "George Orwell"],
  ["Fahrenheit 451", "Ray Bradbury"],
  ["Brave New World", "Aldous Huxley"],
  ["Animal Farm", "George Orwell"],
  ["The Great Gatsby", "F. Scott Fitzgerald"],
  ["To Kill a Mockingbird", "Harper Lee"],
  ["The Catcher in the Rye", "J.D. Salinger"],
  ["The Odyssey", "Homer"],
  ["Stardust", "Neil Gaiman"],
  ["The Night Circus", "Erin Morgenstern"],
  ["Frankenstein", "Mary Shelley"],
  ["Dracula", "Bram Stoker"],
  ["Jane Eyre", "Charlotte Brontë"],
  ["Wuthering Heights", "Emily Brontë"],
  ["Dune", "Frank Herbert"],
  ["Foundation", "Isaac Asimov"],
  ["Hyperion", "Dan Simmons"],
  ["Neuromancer", "William Gibson"],
  ["The Name of the Wind", "Patrick Rothfuss"],
  ["A Game of Thrones", "George R.R. Martin"],
  ["A Wizard of Earthsea", "Ursula K. Le Guin"],
  ["Good Omens", "Neil Gaiman & Terry Pratchett"],
  ["The Shadow of the Wind", "Carlos Ruiz Zafón"],
  ["The Starless Sea", "Erin Morgenstern"],
];

type BacklogFile = { version: number; books: { title: string; author: string; origin: string }[] };

describe("the tool's files and npm script", () => {
  it("adds the `content` script and no dependency", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(pkg.scripts.content).toBe("tsx scripts/content/cli.ts");
    expect(Object.keys(pkg.dependencies)).not.toContain("tsx");
    expect(Object.keys(pkg.devDependencies)).toContain("tsx");
  });

  it.each(["cli", "limits", "backlog", "schema", "brief", "check", "verify", "net", "approve", "report"])("scripts/content/%s.ts exists", (name) => {
    expect(existsSync(path.join(root, "scripts", "content", `${name}.ts`))).toBe(true);
  });
});

describe("#20 the committed backlog", () => {
  it("has the 25 classics in seed order, the 4 bestsellers of docs/books.json, then Anathem (30 entries)", () => {
    expect(existsSync(path.join(root, "docs", "book-backlog.json")), "docs/book-backlog.json exists").toBe(true);
    const backlog = JSON.parse(read("docs", "book-backlog.json")) as BacklogFile;
    const bestsellers = (JSON.parse(read("docs", "books.json")) as { books: { rank: number; title: string; author: string }[] }).books
      .filter((entry) => entry.rank >= 1 && entry.rank <= 4)
      .sort((a, b) => a.rank - b.rank);

    expect(backlog.version).toBe(1);
    expect(backlog.books).toHaveLength(30);
    expect(backlog.books[29]).toEqual({ title: "Anathem", author: "Neal Stephenson", origin: "other" });
    expect(backlog.books.slice(0, 25).map((entry) => [entry.title, entry.author])).toEqual(CLASSICS);
    expect(backlog.books.slice(0, 25).every((entry) => entry.origin === "classics")).toBe(true);
    expect(bestsellers).toHaveLength(4);
    expect(backlog.books.slice(25, 29).map((entry) => [entry.title, entry.author])).toEqual(bestsellers.map((entry) => [entry.title, entry.author]));
    expect(backlog.books.slice(25, 29).every((entry) => entry.origin === "bestsellers")).toBe(true);
  });

  it("is accepted by the tool: `status --list` prints 30 lines, lists anathem, and writes nothing", () => {
    const ws = workspace();
    ws.write("docs/book-backlog.json", read("docs", "book-backlog.json"));
    const before = ws.tree();
    const result = runCli(ws, ["status", "--list"]);
    expect(result.code, result.text).toBe(0);
    expect(nonEmptyLines(result.stdout)).toHaveLength(30);
    expect(result.stdout).toContain("anathem");
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
  });

  it("content-import #17: the Anathem entry's slug equals the slug of the import fixture's entry", () => {
    expect(slugify("Anathem")).toBe(ANATHEM.slug);
  });
});

describe("#38 (amended) the app and the browser tests do not know the tool or the content file", () => {
  const SCANNED = ["src", path.join("tests", "e2e")];
  const REFERENCE = /scripts[\\/]content|books-content\.json|\.content[\\/'"`]|BOOK_CONTENT_FILE/;

  const walk = (folder: string): string[] =>
    readdirSync(folder).flatMap((name) => {
      if (name === "node_modules" || name === ".next") return [];
      const full = path.join(folder, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it("no file under src/ or tests/e2e/ refers to scripts/content, .content, books-content.json or BOOK_CONTENT_FILE", () => {
    expect(existsSync(path.join(root, "scripts", "content", "cli.ts")), "the tool exists, so the scan is meaningful").toBe(true);
    const offenders = SCANNED.flatMap((folder) => walk(path.join(root, folder)))
      .filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs|json|css|sql|prisma|md)$/.test(file))
      .filter((file) => REFERENCE.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});

describe("content-import #16: the seed is the one place that reads the content file", () => {
  it("prisma/seed.ts honours BOOK_CONTENT_FILE, defaults to .content/books-content.json and validates with ContentFileSchema", () => {
    const seed = read("prisma", "seed.ts");
    expect(seed).toContain("BOOK_CONTENT_FILE");
    expect(seed).toContain(".content");
    expect(seed).toContain("books-content.json");
    expect(seed).toContain("ContentFileSchema");
    expect(seed).toMatch(/scripts\/content\/schema/);
  });
});

describe("#39 the tool imports only node:, zod, its own files and src/lib/slug", () => {
  it("holds for every non-test source file in scripts/content", () => {
    const folder = path.join(root, "scripts", "content");
    const files = existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")) : [];
    expect(files.length, "the tool's source files exist").toBeGreaterThan(0);

    const slugModule = path.join(root, "src", "lib", "slug");
    const offenders: string[] = [];
    for (const name of files) {
      const source = readFileSync(path.join(folder, name), "utf8");
      for (const match of source.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g)) {
        const specifier = match[1];
        if (specifier.startsWith("node:") || specifier === "zod") continue;
        if (specifier.startsWith(".")) {
          const target = path.resolve(folder, specifier).replace(/\.(ts|js)$/, "");
          if (target.startsWith(folder + path.sep) || target === slugModule) continue;
        }
        offenders.push(`${name}: ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("#40 repository configuration", () => {
  const ignored = (file: string) => spawnSync("git", ["check-ignore", "-q", "--", file], { cwd: root }).status === 0;

  it("ignores /.content/ and not the backlog", () => {
    expect(ignored(".content/books-content.json")).toBe(true);
    expect(ignored(".content/drafts/the-hobbit.json")).toBe(true);
    expect(ignored("docs/book-backlog.json")).toBe(false);
  });

  it(".env.example documents CONTENT_CONTACT with an empty value", () => {
    expect(existsSync(path.join(root, ".env.example")), ".env.example exists").toBe(true);
    expect(read(".env.example")).toMatch(/^CONTENT_CONTACT=\s*$/m);
  });
});
