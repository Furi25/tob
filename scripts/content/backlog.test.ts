// Spec: docs/specs/book-content-tool.md, criteria 19 (backlog schema) and 21 (status), through the real CLI.
import { describe, expect, it } from "vitest";
import { backlogOf, BACKLOG_PATH, nonEmptyLines, putBacklog, runCli, treeChange, registerScenarioCleanup, workspace } from "../../tests/support/content-run";
import { approvedBook, draftFor, outputFile } from "../../tests/support/content";
import { parseBookList } from "../covers/list";

registerScenarioCleanup();

const book = (title: string, author = "Some Author", extra: Record<string, unknown> = {}) => ({ title, author, origin: "other", ...extra });

describe("#19 the backlog schema is strict", () => {
  const MANY = Array.from({ length: 101 }, (_, i) => book(`Book Number ${String.fromCharCode(97 + (i % 26))}${i}`));

  // [label, file content, a title that the error must name (or null)]
  const BAD: [string, unknown, string | null][] = [
    ["malformed JSON", "{ nope", null],
    ["a missing title", { version: 1, books: [{ author: "A. Writer", origin: "other" }] }, null],
    ["a missing author", { version: 1, books: [{ title: "Lonely Title", origin: "other" }] }, "Lonely Title"],
    ["an unknown origin", { version: 1, books: [book("Odd Origin", "A. Writer", { origin: "novels" })] }, "Odd Origin"],
    ["an unknown key", { version: 1, books: [book("Extra Key", "A. Writer", { rating: 5 })] }, "Extra Key"],
    ["a duplicate slug", { version: 1, books: [book("Dune"), book("Dune!")] }, "Dune"],
    ["an empty slug", { version: 1, books: [book("!!!")] }, "!!!"],
    ["an invalid ISBN", { version: 1, books: [book("Good Omens", "N. Gaiman", { isbn: "9780441172718" })] }, "Good Omens"],
    ["more than 100 entries", { version: 1, books: MANY }, null],
    ["an entry that is not an object", { version: 1, books: ["Dune"] }, null],
  ];

  it.each(BAD)("%s: exit 2, names the entry, writes nothing, makes no request", (_label, content, named) => {
    const ws = workspace();
    ws.write("custom/backlog.json", content);
    const before = ws.tree();

    const result = runCli(ws, ["status", "--backlog", "custom/backlog.json"]);

    expect(result.code, result.text).toBe(2);
    expect(result.text.trim()).not.toBe("");
    if (named) expect(result.text).toContain(named);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
    expect(ws.exists(".content")).toBe(false);
    expect(result.fetches).toEqual([]);
  });

  it("reads docs/book-backlog.json by default", () => {
    const ws = workspace();
    ws.write(BACKLOG_PATH, "{ nope");
    expect(runCli(ws, ["status"]).code).toBe(2);
  });

  it("an invalid backlog stops every command with exit 2 and nothing written", () => {
    for (const command of [["brief"], ["check"], ["status", "--list"]]) {
      const ws = workspace();
      ws.write(BACKLOG_PATH, { version: 1, books: [book("Dune"), book("Dune!")] });
      const before = ws.tree();
      const result = runCli(ws, command);
      expect(result.code, `${command.join(" ")}: ${result.text}`).toBe(2);
      expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
    }
  });

  it("accepts exactly 100 entries", () => {
    const ws = workspace();
    ws.write(BACKLOG_PATH, { version: 1, books: Array.from({ length: 100 }, (_, i) => book(`Book Number ${i}`)) });
    const result = runCli(ws, ["status", "--list"]);
    expect(result.code, result.text).toBe(0);
    expect(nonEmptyLines(result.stdout)).toHaveLength(100);
  });

  it("accepts a valid ISBN, with or without hyphens, and every origin", () => {
    const ws = workspace();
    ws.write(BACKLOG_PATH, {
      version: 1,
      books: [
        book("Dune", "Frank Herbert", { isbn: "9780441172719", origin: "classics" }),
        book("Hyphenated", "A. Writer", { isbn: "978-0-441-17271-9", origin: "bestsellers" }),
        book("Plain", "A. Writer", { origin: "other", notes: "a note" }),
      ],
    });
    const result = runCli(ws, ["status"]);
    expect(result.code, result.text).toBe(0);
  });
});

describe("#21 status", () => {
  const SLUGS = ["alpha-one", "beta-two", "gamma-three", "delta-four", "epsilon-five"];

  async function statusWorkspace() {
    const ws = workspace();
    putBacklog(ws, ...[
      { title: "Alpha One", author: "Ann Author" },
      { title: "Beta Two", author: "Ann Author" },
      { title: "Gamma Three", author: "Ann Author" },
      { title: "Delta Four", author: "Ann Author" },
      { title: "Epsilon Five", author: "Ann Author" },
    ]);
    ws.write(".content/prompts/beta-two.md", "prompt");
    ws.write(".content/drafts/gamma-three.json", await draftFor("Gamma Three", "Ann Author"));
    const delta = await draftFor("Delta Four", "Ann Author");
    ws.write(".content/drafts/delta-four.json", delta);
    // Epsilon has a prompt, a draft and an approved entry: the most advanced state wins.
    const epsilon = await draftFor("Epsilon Five", "Ann Author");
    ws.write(".content/prompts/epsilon-five.md", "prompt");
    ws.write(".content/drafts/epsilon-five.json", epsilon);
    ws.write(".content/books-content.json", outputFile(approvedBook(delta), approvedBook(epsilon)));
    return ws;
  }

  it("derives new, briefed, drafted and approved, one line per book", async () => {
    const ws = await statusWorkspace();
    const result = runCli(ws, ["status"]);
    expect(result.code, result.text).toBe(0);

    const expected: Record<string, string> = {
      "alpha-one": "new",
      "beta-two": "briefed",
      "gamma-three": "drafted",
      "delta-four": "approved",
      "epsilon-five": "approved",
    };
    for (const slug of SLUGS) {
      const lines = result.stdout.split(/\r?\n/).filter((line) => line.includes(slug));
      expect(lines, `a line for ${slug}`).toHaveLength(1);
      const line = lines[0].toLowerCase();
      for (const status of ["new", "briefed", "drafted", "approved"]) {
        const has = new RegExp(`\\b${status}\\b`).test(line);
        expect(has, `${slug} line "${lines[0]}" about ${status}`).toBe(status === expected[slug]);
      }
      expect(lines[0]).toContain("Ann Author");
    }
  });

  it("writes nothing and makes no request", async () => {
    const ws = await statusWorkspace();
    const before = ws.tree();
    const bytes = SLUGS.map((slug) => (ws.exists(`.content/drafts/${slug}.json`) ? ws.read(`.content/drafts/${slug}.json`) : ""));
    const result = runCli(ws, ["status"]);
    expect(result.code, result.text).toBe(0);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
    expect(SLUGS.map((slug) => (ws.exists(`.content/drafts/${slug}.json`) ? ws.read(`.content/drafts/${slug}.json`) : ""))).toEqual(bytes);
    expect(result.fetches).toEqual([]);
  });

  it("--list prints exactly one `Title | Author[ | ISBN]` line per entry, in backlog order", () => {
    const ws = workspace();
    ws.write(BACKLOG_PATH, backlogOf(
      { title: "Dune", author: "Frank Herbert", isbn: "9780441172719" },
      { title: "Plain Title", author: "A. Writer" },
    ));
    const before = ws.tree();
    const result = runCli(ws, ["status", "--list"]);
    expect(result.code, result.text).toBe(0);
    expect(nonEmptyLines(result.stdout)).toEqual(["Dune | Frank Herbert | 9780441172719", "Plain Title | A. Writer"]);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
    expect(result.fetches).toEqual([]);
  });

  it("--list output is accepted by the cover tool's parseBookList", () => {
    const ws = workspace();
    ws.write(BACKLOG_PATH, backlogOf(
      { title: "Dune", author: "Frank Herbert", isbn: "9780441172719" },
      { title: "Plain Title", author: "A. Writer" },
    ));
    const parsed = parseBookList(runCli(ws, ["status", "--list"]).stdout);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (parsed.ok) expect(parsed.books.map((entry) => entry.title)).toEqual(["Dune", "Plain Title"]);
  });
});
