// Spec: docs/specs/book-content-tool.md, criteria 35-37 (approve), through the real CLI. The check report is written by hand
// (hash of the draft file's bytes, see tests/support/content.ts) so that approve is tested on its own, without `check`.
import { describe, expect, it } from "vitest";
import {
  approvedBook,
  ContentFileSchema,
  draftFor,
  factFor,
  outputFile,
  sha256,
  words,
  withPhrase,
  type Draft,
  type FactResult,
} from "../../tests/support/content";
import { putBacklog, putDraft, putReport, runCli, treeChange, registerScenarioCleanup, workspace, type Workspace } from "../../tests/support/content-run";

registerScenarioCleanup();

const OUTPUT = ".content/books-content.json";

/** A valid draft with one figure and its fact, for a book called `title`. */
async function factDraft(title: string, over: Partial<Draft> = {}): Promise<Draft> {
  const base = await draftFor(title, "Ann Author", over);
  return { ...withPhrase(base, "about", "In 2023 it grew."), facts: [factFor("2023", base.sources[0])], ...over };
}

const verified = (draft: Draft, result: FactResult["result"] = "verified"): FactResult[] =>
  draft.facts.map((fact) => ({ claim: fact.claim, sourceUrl: fact.sourceUrl, result }));

type Scenario = { ws: Workspace; alpha: Draft; beta: Draft; gamma: Draft };

/** Three books, three drafts, and a report that says every fact is verified. */
async function scenario(): Promise<Scenario> {
  const ws = workspace();
  const alpha = await factDraft("Alpha One");
  const beta = await factDraft("Beta Two");
  const gamma = await draftFor("Gamma Three", "Ann Author"); // no figure, no fact
  putBacklog(ws, ...[alpha, beta, gamma].map((draft) => ({ title: draft.title, author: draft.author })));
  for (const draft of [alpha, beta, gamma]) putDraft(ws, draft);
  putReport(ws, [
    { slug: "alpha-one", facts: verified(alpha) },
    { slug: "beta-two", facts: verified(beta) },
    { slug: "gamma-three", facts: [] },
  ]);
  return { ws, alpha, beta, gamma };
}

const strayFiles = (ws: Workspace) =>
  ws.tree().filter((name) => name.startsWith(".content/") && !name.startsWith(".content/drafts/") && name !== ".content/report.json" && name !== OUTPUT);

describe("#35 approve adds a checked draft to the output file", () => {
  it("creates .content/books-content.json with the draft plus a review block", async () => {
    const { ws, alpha } = await scenario();
    expect(ws.exists(OUTPUT)).toBe(false);
    const start = Date.now();

    const result = runCli(ws, ["approve", "alpha-one"]);
    expect(result.code, result.text).toBe(0);
    const end = Date.now();

    const file = ContentFileSchema.parse(ws.json(OUTPUT));
    expect(file.books).toHaveLength(1);
    const [entry] = file.books;
    const { review, ...draftPart } = entry;
    expect(draftPart).toEqual(alpha);
    expect(review.verification).toBe("complete");
    expect(review.warningsAccepted).toBe(false);
    expect(review.draftSha256).toBe(sha256(Buffer.from(ws.read(".content/drafts/alpha-one.json"))));
    for (const stamp of [file.generated, review.approvedAt]) {
      expect(Date.parse(stamp)).toBeGreaterThanOrEqual(start - 1000);
      expect(Date.parse(stamp)).toBeLessThanOrEqual(end + 1000);
    }
    expect(result.fetches).toEqual([]);
  });

  it("sorts the entries by slug, however the arguments were ordered", async () => {
    const { ws } = await scenario();
    const result = runCli(ws, ["approve", "gamma-three", "beta-two", "alpha-one"]);
    expect(result.code, result.text).toBe(0);
    expect(ContentFileSchema.parse(ws.json(OUTPUT)).books.map((book) => book.slug)).toEqual(["alpha-one", "beta-two", "gamma-three"]);
  });

  it("adds to an existing file and leaves the entries already there as they are", async () => {
    const { ws, alpha, beta } = await scenario();
    const existing = approvedBook(beta, { approvedAt: "2026-01-02T03:04:05.000Z" });
    ws.write(OUTPUT, outputFile(existing));
    const result = runCli(ws, ["approve", "alpha-one"]);
    expect(result.code, result.text).toBe(0);
    const books = ContentFileSchema.parse(ws.json(OUTPUT)).books;
    expect(books.map((book) => book.slug)).toEqual(["alpha-one", "beta-two"]);
    expect(books[1]).toEqual(existing);
    expect(books[0].about).toBe(alpha.about);
  });

  it("records `partial` when a fact was not verified, and refuses it without --accept-warnings", async () => {
    const { ws, alpha } = await scenario();
    putReport(ws, [{ slug: "alpha-one", facts: verified(alpha, "not-found") }]);

    const refused = runCli(ws, ["approve", "alpha-one"]);
    expect(refused.code, refused.text).toBe(1);
    expect(ws.exists(OUTPUT)).toBe(false);

    const accepted = runCli(ws, ["approve", "alpha-one", "--accept-warnings"]);
    expect(accepted.code, accepted.text).toBe(0);
    const [entry] = ContentFileSchema.parse(ws.json(OUTPUT)).books;
    expect(entry.review.verification).toBe("partial");
    expect(entry.review.warningsAccepted).toBe(true);
  });

  it("the result passes `check --approved`", async () => {
    const { ws } = await scenario();
    expect(runCli(ws, ["approve", "alpha-one", "gamma-three"]).code).toBe(0);
    const result = runCli(ws, ["check", "--approved"]);
    expect(result.code, result.text).toBe(0);
  });
});

describe("#36 approve refuses (exit 1, nothing written for that slug)", () => {
  it("a draft with an error, even with every flag", async () => {
    const { ws, gamma } = await scenario();
    putDraft(ws, { ...gamma, about: words(1) });
    putReport(ws, [{ slug: "gamma-three", facts: [] }]);
    for (const flags of [[], ["--accept-warnings"], ["--skip-verification"], ["--accept-warnings", "--skip-verification"]]) {
      const result = runCli(ws, ["approve", "gamma-three", ...flags]);
      expect(result.code, `${flags.join(" ")}: ${result.text}`).toBe(1);
    }
    expect(ws.exists(OUTPUT)).toBe(false);
  });

  it("a draft with a warning and no --accept-warnings; with the flag it is approved and warningsAccepted is true", async () => {
    const { ws, gamma } = await scenario();
    putDraft(ws, { ...gamma, confidence: "medium" });
    putReport(ws, [{ slug: "gamma-three", facts: [] }]);

    expect(runCli(ws, ["approve", "gamma-three"]).code).toBe(1);
    expect(ws.exists(OUTPUT)).toBe(false);

    const accepted = runCli(ws, ["approve", "gamma-three", "--accept-warnings"]);
    expect(accepted.code, accepted.text).toBe(0);
    const [entry] = ContentFileSchema.parse(ws.json(OUTPUT)).books;
    expect(entry.review.warningsAccepted).toBe(true);
    expect(entry.review.verification).toBe("complete");
  });

  it("a draft changed after the last check; --skip-verification approves it as `skipped`", async () => {
    const { ws, gamma } = await scenario();
    putDraft(ws, { ...gamma, drafter: "Claude (edited after the check)" });

    const refused = runCli(ws, ["approve", "gamma-three"]);
    expect(refused.code, refused.text).toBe(1);
    expect(ws.exists(OUTPUT)).toBe(false);

    const skipped = runCli(ws, ["approve", "gamma-three", "--skip-verification"]);
    expect(skipped.code, skipped.text).toBe(0);
    const [entry] = ContentFileSchema.parse(ws.json(OUTPUT)).books;
    expect(entry.review.verification).toBe("skipped");
    expect(entry.review.draftSha256).toBe(sha256(Buffer.from(ws.read(".content/drafts/gamma-three.json"))));
  });

  it("a draft that was never checked online: no report, another slug's report, or a report without verification", async () => {
    const { ws } = await scenario();

    ws.write(".content/report.json", { generatedAt: new Date().toISOString(), drafts: [] });
    expect(runCli(ws, ["approve", "alpha-one"]).code, "an empty report").toBe(1);

    putReport(ws, [{ slug: "beta-two", facts: [] }]);
    expect(runCli(ws, ["approve", "alpha-one"]).code, "a report for another slug").toBe(1);

    putReport(ws, [{ slug: "alpha-one", facts: null }]);
    expect(runCli(ws, ["approve", "alpha-one"]).code, "a report from `check` without --verify-sources").toBe(1);

    expect(ws.exists(OUTPUT)).toBe(false);
  });

  it("with no report file at all it is refused; with --skip-verification it is approved as `skipped`", async () => {
    const fresh = workspace();
    const draft = await draftFor("Gamma Three", "Ann Author");
    putBacklog(fresh, { title: draft.title, author: draft.author });
    putDraft(fresh, draft);
    expect(runCli(fresh, ["approve", "gamma-three"]).code).toBe(1);
    expect(fresh.exists(OUTPUT)).toBe(false);

    const skipped = runCli(fresh, ["approve", "gamma-three", "--skip-verification"]);
    expect(skipped.code, skipped.text).toBe(0);
    expect(ContentFileSchema.parse(fresh.json(OUTPUT)).books[0].review.verification).toBe("skipped");
  });

  it("an existing entry for the slug without --replace, leaving the file byte for byte as it was", async () => {
    const { ws, alpha } = await scenario();
    ws.write(OUTPUT, outputFile(approvedBook({ ...alpha, drafter: "Claude (the earlier approval)" })));
    const before = ws.read(OUTPUT);
    const result = runCli(ws, ["approve", "alpha-one"]);
    expect(result.code, result.text).toBe(1);
    expect(ws.read(OUTPUT)).toBe(before);
  });

  it("--replace replaces that entry and touches no other", async () => {
    const { ws, alpha, beta } = await scenario();
    const oldAlpha = approvedBook({ ...alpha, drafter: "Claude (the earlier approval)" });
    const oldBeta = approvedBook(beta, { approvedAt: "2026-01-02T03:04:05.000Z" });
    ws.write(OUTPUT, outputFile(oldAlpha, oldBeta));

    const result = runCli(ws, ["approve", "alpha-one", "--replace"]);
    expect(result.code, result.text).toBe(0);
    const [first, second] = ContentFileSchema.parse(ws.json(OUTPUT)).books;
    expect(first.slug).toBe("alpha-one");
    expect(first.drafter).toBe(alpha.drafter);
    expect(first.review.approvedAt).not.toBe(oldAlpha.review.approvedAt);
    expect(second).toEqual(oldBeta);
  });

  it("a slug that is not in the backlog exits 2 and writes nothing", async () => {
    const { ws } = await scenario();
    const before = ws.tree();
    const result = runCli(ws, ["approve", "not-in-the-backlog"]);
    expect(result.code, result.text).toBe(2);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
  });
});

describe("#37 several slugs, and clean writes", () => {
  it("a refusal for one slug does not stop the others", async () => {
    const { ws, gamma } = await scenario();
    putDraft(ws, { ...gamma, about: words(1) });
    putReport(ws, [
      { slug: "alpha-one", facts: [{ claim: "2023", sourceUrl: "https://publisher.example.com/the-test-book", result: "verified" }] },
      { slug: "gamma-three", facts: [] },
    ]);

    const result = runCli(ws, ["approve", "gamma-three", "alpha-one"]);
    expect(result.code, result.text).toBe(1);
    expect(ContentFileSchema.parse(ws.json(OUTPUT)).books.map((book) => book.slug)).toEqual(["alpha-one"]);
  });

  it("leaves no temporary or stray file behind, after a success or a refusal", async () => {
    const { ws } = await scenario();
    expect(runCli(ws, ["approve", "alpha-one"]).code).toBe(0);
    expect(strayFiles(ws)).toEqual([]);
    expect(runCli(ws, ["approve", "alpha-one"]).code).toBe(1);
    expect(strayFiles(ws)).toEqual([]);
  });

  it("never changes a draft", async () => {
    const { ws } = await scenario();
    const before = ws.read(".content/drafts/alpha-one.json");
    runCli(ws, ["approve", "alpha-one"]);
    expect(ws.read(".content/drafts/alpha-one.json")).toBe(before);
  });
});

describe("#41 genres in approved entries", () => {
  const GENRES = ["Gothic fiction", "20th-century fiction", "science FICTION", "Mystery", "Satire"];

  it("keeps the genres as written: same entries, same order, same case", async () => {
    const { ws, gamma } = await scenario();
    putDraft(ws, { ...gamma, genres: GENRES });
    putReport(ws, [{ slug: "gamma-three", facts: [] }]);
    const result = runCli(ws, ["approve", "gamma-three"]);
    expect(result.code, result.text).toBe(0);
    const [entry] = ContentFileSchema.parse(ws.json(OUTPUT)).books;
    expect(entry.genres).toEqual(GENRES);
  });

  it.each([
    ["none", []],
    ["six", ["Gothic fiction", "Science fiction", "Historical novel", "Mystery", "Satire", "Fantasy"]],
    ["an empty entry", ["Gothic fiction", ""]],
    ["two entries that differ only in case", ["Gothic fiction", "gothic FICTION"]],
    ["an entry with markup", ["<b>Gothic</b>"]],
  ])("refuses a draft with %s as genres, even with every flag, and writes nothing", async (_label, genres) => {
    const { ws, gamma } = await scenario();
    putDraft(ws, { ...gamma, genres });
    putReport(ws, [{ slug: "gamma-three", facts: [] }]);
    for (const flags of [[], ["--accept-warnings", "--skip-verification"]]) {
      const result = runCli(ws, ["approve", "gamma-three", ...flags]);
      expect(result.code, `${flags.join(" ")}: ${result.text}`).toBe(1);
    }
    expect(ws.exists(OUTPUT)).toBe(false);
  });

  it("refuses a draft in the earlier format, with no genres", async () => {
    const { ws, gamma } = await scenario();
    const earlier: Record<string, unknown> = { ...gamma };
    delete earlier.genres;
    putDraft(ws, earlier as unknown as Draft);
    putReport(ws, [{ slug: "gamma-three", facts: [] }]);
    const result = runCli(ws, ["approve", "gamma-three", "--accept-warnings", "--skip-verification"]);
    expect(result.code, result.text).toBe(1);
    expect(ws.exists(OUTPUT)).toBe(false);
  });
});
