// Spec: docs/specs/book-content-tool.md, criteria 17 (exit code), 25 (slug arguments), 33 (contact) and 34 (report), through the CLI.
import { describe, expect, it } from "vitest";
import {
  CheckReportSchema,
  CONTACT,
  draftFor,
  sha256,
  validDraft,
  words,
  type Draft,
} from "../../tests/support/content";
import { approvedBook, outputFile } from "../../tests/support/content";
import { nonEmptyLines, putBacklog, putDraft, runCli, treeChange, registerScenarioCleanup, workspace, type Workspace } from "../../tests/support/content-run";

registerScenarioCleanup();

/** A workspace whose backlog has one entry per draft, and whose drafts folder holds the drafts. */
function withDrafts(drafts: Draft[]): Workspace {
  const ws = workspace();
  putBacklog(ws, ...drafts.map((draft) => ({ title: draft.title, author: draft.author })));
  for (const draft of drafts) putDraft(ws, draft);
  return ws;
}

describe("#25 a slug argument that fails the slug regex exits 2 before anything is built", () => {
  const BAD = ["../x", "A", "a/b", "", "x".repeat(101)];

  describe.each(["brief", "check", "approve"])("%s", (command) => {
    it.each(BAD)("rejects %j", async (slug) => {
      const ws = withDrafts([await validDraft()]);
      const before = ws.tree();
      const result = runCli(ws, [command, slug]);
      expect(result.code, result.text).toBe(2);
      expect(ws.exists(".content/prompts")).toBe(false);
      expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
      expect(result.fetches).toEqual([]);
    });
  });

  it.each(["a--b", "-a", "a-"])("brief rejects %j", async (slug) => {
    const ws = withDrafts([await validDraft()]);
    const before = ws.tree();
    const result = runCli(ws, ["brief", slug]);
    expect(result.code, result.text).toBe(2);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
  });

  it("rejects a bad slug even when a good one comes first, and writes nothing for the good one", async () => {
    const ws = withDrafts([await validDraft()]);
    const before = ws.tree();
    expect(runCli(ws, ["brief", "the-test-book", "../x"]).code).toBe(2);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
  });

  it.each([["status", "--frobnicate"], ["brief", "--nope"], ["check", "--nope"], ["approve", "--nope"], ["frobnicate"]])("%j is a usage error", async (...args) => {
    const ws = withDrafts([await validDraft()]);
    const before = ws.tree();
    const result = runCli(ws, args);
    expect(result.code, result.text).toBe(2);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
  });
});

describe("#33 CONTENT_CONTACT", () => {
  const BAD: [string, string | undefined][] = [
    ["missing", undefined],
    ["empty", ""],
    ["2 characters", "ab"],
    ["201 characters", "a".repeat(201)],
    ["a control character", "dev@\u0007example.org"],
  ];

  it.each(BAD)("a %s contact with --verify-sources exits 2 before any request", async (_label, contact) => {
    const ws = withDrafts([await validDraft()]);
    const before = ws.tree();
    const result = runCli(ws, ["check", "--verify-sources"], { CONTENT_CONTACT: contact });
    expect(result.code, result.text).toBe(2);
    expect(result.text).toContain("CONTENT_CONTACT");
    expect(result.fetches).toEqual([]);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
  });

  it.each([["3 characters", "a@b"], ["200 characters", `${"a".repeat(190)}@example.org`.slice(0, 200)]])("a %s contact is accepted", async (_label, contact) => {
    const ws = withDrafts([await validDraft()]);
    const result = runCli(ws, ["check", "--verify-sources"], { CONTENT_CONTACT: contact });
    expect(result.code, result.text).not.toBe(2);
  });

  it("is not needed without --verify-sources", async () => {
    const ws = withDrafts([await validDraft()]);
    const result = runCli(ws, ["check"]);
    expect(result.code, result.text).toBe(0);
  });

  it("appears in no console line and no file", async () => {
    const contact = "leak-test@example.org";
    const ws = withDrafts([await validDraft()]);
    const results = [runCli(ws, ["check", "--verify-sources"], { CONTENT_CONTACT: contact }), runCli(ws, ["status"], { CONTENT_CONTACT: contact })];
    for (const result of results) {
      expect(result.stdout).not.toContain(contact);
      expect(result.stderr).not.toContain(contact);
    }
    for (const name of ws.tree()) expect(ws.read(name), name).not.toContain(contact);
  });
});

describe("check: exit codes and output (criterion 17 and the spec's check section)", () => {
  it("exits 0 for a clean draft and prints one line with the slug and ok", async () => {
    const ws = withDrafts([await validDraft()]);
    const result = runCli(ws, ["check"]);
    expect(result.code, result.text).toBe(0);
    const line = nonEmptyLines(result.stdout).find((candidate) => candidate.includes("the-test-book"));
    expect(line, result.stdout).toMatch(/\bok\b/);
  });

  it("exits 0 when there are only warnings, and puts them in the report", async () => {
    const ws = withDrafts([await validDraft({ confidence: "medium" })]);
    const result = runCli(ws, ["check"]);
    expect(result.code, result.text).toBe(0);
    const report = CheckReportSchema.parse(ws.json(".content/report.json"));
    expect(report.drafts[0].errors).toEqual([]);
    expect(report.drafts[0].warnings.some((warning) => warning.field.startsWith("confidence"))).toBe(true);
  });

  it("exits 1 for a draft with an error, and names it in the report and on the console", async () => {
    const ws = withDrafts([await validDraft({ about: words(1) })]);
    const result = runCli(ws, ["check"]);
    expect(result.code, result.text).toBe(1);
    const report = CheckReportSchema.parse(ws.json(".content/report.json"));
    expect(report.drafts[0].errors.some((error) => error.field.startsWith("about"))).toBe(true);
    const line = nonEmptyLines(result.stdout).find((candidate) => candidate.includes("the-test-book"));
    expect(line).toMatch(/1 error\b/);
  });

  it("exits 1 for a draft whose author differs from the backlog's", async () => {
    const ws = withDrafts([await validDraft()]);
    putBacklog(ws, { title: "The Test Book", author: "Someone Else" });
    expect(runCli(ws, ["check", "the-test-book"]).code).toBe(1);
  });

  it("exits 1 for a reply still wrapped in Markdown fences, and says so", async () => {
    const ws = workspace();
    putBacklog(ws, { title: "The Test Book", author: "Ada Writer" });
    ws.write(".content/drafts/the-test-book.json", `\`\`\`json\n${JSON.stringify(await validDraft(), null, 2)}\n\`\`\``);
    const result = runCli(ws, ["check"]);
    expect(result.code, result.text).toBe(1);
    expect(result.text).toMatch(/markdown|fence|code block/i);
  });

  it("exits 1 for a file that is not JSON", async () => {
    const ws = workspace();
    putBacklog(ws, { title: "The Test Book", author: "Ada Writer" });
    ws.write(".content/drafts/the-test-book.json", "{ nope");
    expect(runCli(ws, ["check"]).code).toBe(1);
  });
});

describe("#34 report.json", () => {
  it("passes its schema, has one entry per checked draft with the file's SHA-256, and verification is null", async () => {
    const alpha = await draftFor("Alpha One", "Ann Author");
    const beta = await draftFor("Beta Two", "Ann Author", { about: words(1) });
    const ws = withDrafts([alpha, beta]);

    const result = runCli(ws, ["check"]);
    expect(result.code, result.text).toBe(1);
    const report = CheckReportSchema.parse(ws.json(".content/report.json"));
    expect(Date.parse(report.generatedAt)).not.toBeNaN();
    expect(report.drafts.map((entry) => entry.slug).sort()).toEqual(["alpha-one", "beta-two"]);
    for (const entry of report.drafts) {
      expect(entry.draftSha256).toBe(sha256(Buffer.from(ws.read(`.content/drafts/${entry.slug}.json`))));
      expect(entry.verification).toBeNull();
    }
    expect(report.drafts.find((entry) => entry.slug === "alpha-one")?.errors).toEqual([]);
    expect(report.drafts.find((entry) => entry.slug === "beta-two")?.errors.length).toBeGreaterThan(0);
  });

  it("covers only the slugs asked for", async () => {
    const ws = withDrafts([await draftFor("Alpha One", "Ann Author"), await draftFor("Beta Two", "Ann Author")]);
    const result = runCli(ws, ["check", "beta-two"]);
    expect(result.code, result.text).toBe(0);
    expect(CheckReportSchema.parse(ws.json(".content/report.json")).drafts.map((entry) => entry.slug)).toEqual(["beta-two"]);
  });

  it("with --verify-sources and an unreachable source, adds a verification block per fact", async () => {
    const draft = await draftFor("Alpha One", "Ann Author", {});
    const withFact: Draft = {
      ...draft,
      about: `In 2023 it grew. ${draft.about}`,
      facts: [{ claim: "2023", sourceUrl: draft.sources[0], evidence: "In 2023 it grew by a lot" }],
    };
    const ws = withDrafts([withFact]);
    const result = runCli(ws, ["check", "--verify-sources"], { CONTENT_CONTACT: CONTACT });
    // No network in the test: the page cannot be read, which is a warning and not an error.
    expect(result.code, result.text).toBe(0);
    const report = CheckReportSchema.parse(ws.json(".content/report.json"));
    expect(report.drafts[0].verification?.facts).toEqual([{ claim: "2023", sourceUrl: draft.sources[0], result: "unreachable" }]);
    expect(report.drafts[0].warnings.length).toBeGreaterThan(0);
  });
});

describe("check --approved", () => {
  it("validates the output file offline: exit 0 for a valid one, and no report written", async () => {
    const draft = await validDraft();
    const ws = workspace();
    putBacklog(ws, { title: draft.title, author: draft.author });
    ws.write(".content/books-content.json", outputFile(approvedBook(draft)));
    const result = runCli(ws, ["check", "--approved"]);
    expect(result.code, result.text).toBe(0);
    expect(ws.exists(".content/report.json")).toBe(false);
    expect(result.fetches).toEqual([]);
  });

  it("exits 1 for an output file with an invalid entry", async () => {
    const draft = await validDraft({ about: words(1) });
    const ws = workspace();
    putBacklog(ws, { title: draft.title, author: draft.author });
    ws.write(".content/books-content.json", outputFile(approvedBook(draft)));
    expect(runCli(ws, ["check", "--approved"]).code).toBe(1);
  });

  it("exits 1 for an entry without its review block", async () => {
    const draft = await validDraft();
    const ws = workspace();
    putBacklog(ws, { title: draft.title, author: draft.author });
    ws.write(".content/books-content.json", { version: 1, generated: "2026-10-25T12:00:00.000Z", books: [draft] });
    expect(runCli(ws, ["check", "--approved"]).code).toBe(1);
  });

  it("accepts an entry with 1 genre and with 5, and exits 1 for an entry without genres or with an invalid list (criterion 41)", async () => {
    const draft = await validDraft();
    const run = (genres: unknown) => {
      const ws = workspace();
      putBacklog(ws, { title: draft.title, author: draft.author });
      const entry: Record<string, unknown> = { ...approvedBook(draft), genres };
      if (genres === undefined) delete entry.genres;
      ws.write(".content/books-content.json", { ...outputFile(), books: [entry] });
      return runCli(ws, ["check", "--approved"]);
    };
    expect(run(["Gothic fiction"]).code).toBe(0);
    expect(run(["Gothic fiction", "Science fiction", "Historical novel", "Mystery", "Satire"]).code).toBe(0);
    for (const bad of [undefined, [], ["a", "b", "c", "d", "e", "f"], ["Gothic fiction", "gothic fiction"], [""], "Gothic fiction"]) {
      const result = run(bad);
      expect(result.code, `genres ${JSON.stringify(bad)}: ${result.text}`).toBe(1);
    }
  });
});

describe("check: genres in a draft (criterion 41)", () => {
  it("exits 1 for a draft in the earlier format, without genres, and names `genres` in the report", async () => {
    const earlier: Record<string, unknown> = { ...(await validDraft()) };
    delete earlier.genres;
    const ws = withDrafts([earlier as unknown as Draft]);
    const result = runCli(ws, ["check"]);
    expect(result.code, result.text).toBe(1);
    const report = CheckReportSchema.parse(ws.json(".content/report.json"));
    expect(report.drafts[0].errors.some((error) => error.field === "genres" || error.field.startsWith("genres."))).toBe(true);
  });

  it("exits 1 for a list of 6, and 0 for 1 and for 5; the report names `genres.<index>` for a bad entry", async () => {
    const six = withDrafts([await validDraft({ genres: ["a", "b", "c", "d", "e", "f"] })]);
    expect(runCli(six, ["check"]).code).toBe(1);
    expect(runCli(withDrafts([await validDraft({ genres: ["Gothic fiction"] })]), ["check"]).code).toBe(0);
    expect(runCli(withDrafts([await validDraft({ genres: ["a", "b", "c", "d", "e"] })]), ["check"]).code).toBe(0);

    const bad = withDrafts([await validDraft({ genres: ["Gothic fiction", ""] })]);
    expect(runCli(bad, ["check"]).code).toBe(1);
    const report = CheckReportSchema.parse(bad.json(".content/report.json"));
    expect(report.drafts[0].errors.map((error) => error.field)).toContain("genres.1");
  });

  it("does not need a fact for a genre with a digit in it", async () => {
    const ws = withDrafts([await validDraft({ genres: ["20th-century fiction"] })]);
    const result = runCli(ws, ["check"]);
    expect(result.code, result.text).toBe(0);
  });
});
