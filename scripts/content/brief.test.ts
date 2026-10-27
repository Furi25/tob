// Spec: docs/specs/book-content-tool.md, criteria 22-24 (brief), through the real CLI, plus renderPrompt in-process for
// the "changing limits.ts changes the prompt" half of criterion 23 and for criterion 18's "the prompt mentions the hype terms".
// The wording checks in #23 are keyword heuristics: the spec fixes what the prompt must say, not the exact words.
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLimits, TEXT_FIELDS } from "../../tests/support/content";
import { backlogOf, nonEmptyLines, putBacklog, putDraft, runCli, treeChange, registerScenarioCleanup, workspace, type Workspace } from "../../tests/support/content-run";
import { approvedBook, draftFor, outputFile } from "../../tests/support/content";

registerScenarioCleanup();

const PROMPTS = ".content/prompts";

async function briefWorkspace() {
  const ws = workspace();
  putBacklog(
    ws,
    { title: "Alpha One", author: "Ann Author" },
    { title: "Gamma Three", author: "Ann Author" },
    { title: "Delta Four", author: "Ann Author" },
  );
  putDraft(ws, await draftFor("Gamma Three", "Ann Author"));
  const delta = await draftFor("Delta Four", "Ann Author");
  putDraft(ws, delta);
  ws.write(".content/books-content.json", outputFile(approvedBook(delta)));
  return ws;
}

const promptFiles = (ws: Workspace) => ws.tree().filter((name) => name.startsWith(`${PROMPTS}/`));

describe("#22 which books get a prompt", () => {
  it("with no slugs: every book that is not approved, one <slug>.md each, nothing else written", async () => {
    const ws = await briefWorkspace();
    const before = ws.tree();
    const result = runCli(ws, ["brief"]);
    expect(result.code, result.text).toBe(0);
    expect(treeChange(before, ws.tree())).toEqual({ added: [`${PROMPTS}/alpha-one.md`, `${PROMPTS}/gamma-three.md`], removed: [] });
    expect(result.fetches).toEqual([]);
  });

  it("--all: every book, approved or not", async () => {
    const ws = await briefWorkspace();
    const before = ws.tree();
    expect(runCli(ws, ["brief", "--all"]).code).toBe(0);
    expect(treeChange(before, ws.tree()).added).toEqual([`${PROMPTS}/alpha-one.md`, `${PROMPTS}/delta-four.md`, `${PROMPTS}/gamma-three.md`]);
  });

  it("with slugs: those books, even an approved one, and no others", async () => {
    const ws = await briefWorkspace();
    const before = ws.tree();
    expect(runCli(ws, ["brief", "delta-four"]).code).toBe(0);
    expect(treeChange(before, ws.tree()).added).toEqual([`${PROMPTS}/delta-four.md`]);
  });

  it("a slug that is not in the backlog exits 2 and writes nothing, not even for the valid slugs beside it", async () => {
    const ws = await briefWorkspace();
    const before = ws.tree();
    const result = runCli(ws, ["brief", "alpha-one", "no-such-book"]);
    expect(result.code, result.text).toBe(2);
    expect(result.text).toContain("no-such-book");
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
  });

  it("--stdout with one book prints the prompt that the file would hold, and writes no file", async () => {
    const ws = await briefWorkspace();
    const before = ws.tree();
    const printed = runCli(ws, ["brief", "alpha-one", "--stdout"]);
    expect(printed.code, printed.text).toBe(0);
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });

    expect(runCli(ws, ["brief", "alpha-one"]).code).toBe(0);
    expect(printed.stdout.trimEnd()).toBe(ws.read(`${PROMPTS}/alpha-one.md`).trimEnd());
    expect(printed.stdout).toContain("Alpha One");
  });

  it("--stdout with several books exits 2 and writes nothing", async () => {
    const ws = await briefWorkspace();
    const before = ws.tree();
    for (const args of [["brief", "alpha-one", "gamma-three", "--stdout"], ["brief", "--all", "--stdout"]]) {
      const result = runCli(ws, args);
      expect(result.code, `${args.join(" ")}: ${result.text}`).toBe(2);
    }
    expect(treeChange(before, ws.tree())).toEqual({ added: [], removed: [] });
  });

  it("--stdout with no book to brief exits 2", async () => {
    const ws = workspace();
    putBacklog(ws, { title: "Delta Four", author: "Ann Author" });
    ws.write(".content/books-content.json", outputFile(approvedBook(await draftFor("Delta Four", "Ann Author"))));
    // The only book is approved and no slug is given, so zero books are selected.
    const result = runCli(ws, ["brief", "--stdout"]);
    expect(result.code, result.text).toBe(2);
    expect(promptFiles(ws)).toEqual([]);
  });
});

describe("#23 what a prompt contains", () => {
  async function prompt(slug = "alpha-one") {
    const ws = await briefWorkspace();
    const result = runCli(ws, ["brief", slug, "--stdout"]);
    expect(result.code, result.text).toBe(0);
    return result.stdout;
  }

  it("states the voice rules: critic and storyteller, English, tenses, one reservation, no hype", async () => {
    const text = await prompt();
    expect(text).toMatch(/critic/i);
    expect(text).toMatch(/storyteller/i);
    expect(text).toMatch(/English/);
    expect(text).toMatch(/present tense/i);
    expect(text).toMatch(/past tense/i);
    expect(text).toMatch(/reservation/i);
    expect(text).toMatch(/hype/i);
  });

  it("states the sourcing rules: reputable sources, traceable figures, no guessing, 15-word quotes, no spoilers", async () => {
    const text = await prompt();
    expect(text).toMatch(/reputable/i);
    expect(text).toMatch(/spoiler/i);
    expect(text).toMatch(/15 words/);
    expect(text).toMatch(/guess|invent/i);
    expect(text).toMatch(/source/i);
  });

  it("tells Claude what to do when it cannot browse: needsReview, confidence low, no invented URLs or quotes", async () => {
    const text = await prompt();
    expect(text).toMatch(/browse|open (web )?pages|web access/i);
    expect(text).toContain("needsReview");
    expect(text).toContain('"low"');
    expect(text).toMatch(/(invent|make up|fabricate)[^.]{0,80}(URL|quote|evidence)/i);
  });

  it("explains the facts rule: a claim, a source URL and an evidence quote", async () => {
    const text = await prompt();
    expect(text).toContain("facts");
    expect(text).toMatch(/claim/);
    expect(text).toMatch(/evidence/);
    expect(text).toMatch(/sourceUrl/);
  });

  it("asks for one JSON object in a single code block and nothing else", async () => {
    const text = await prompt();
    expect(text).toMatch(/JSON/);
    expect(text).toMatch(/code block/i);
    expect(text).toMatch(/nothing else|only (that|the|a single|one)/i);
  });

  it("has a field table with each field's minimum and maximum from limits.ts", async () => {
    const text = await prompt();
    const { LIMITS } = await loadLimits();
    const lines = text.split(/\r?\n/);
    for (const field of TEXT_FIELDS) {
      const { min, max } = LIMITS[field];
      const found = lines.some(
        (line) => new RegExp(`\\b${field}\\b`).test(line) && new RegExp(`\\b${min}\\b`).test(line) && new RegExp(`\\b${max}\\b`).test(line),
      );
      expect(found, `a line naming ${field} with ${min} and ${max}`).toBe(true);
    }
  });

  it("has a JSON skeleton that parses, with the book's slug, title and author filled in", async () => {
    const text = await prompt();
    const blocks = [...text.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
    const skeletons = blocks.flatMap((block) => {
      try {
        const value = JSON.parse(block) as Record<string, unknown>;
        return value && typeof value === "object" && value.slug === "alpha-one" ? [value] : [];
      } catch {
        return [];
      }
    });
    expect(skeletons.length, "a fenced block that parses as JSON with slug alpha-one").toBeGreaterThan(0);
    const skeleton = skeletons[0];
    expect(skeleton.title).toBe("Alpha One");
    expect(skeleton.author).toBe("Ann Author");
    for (const key of [
      "version", "slug", "title", "author", "tagline", "summary", "about", "whyPopular", "whyItMatters", "authorBio",
      "genres", "sources", "facts", "confidence", "needsReview", "drafter",
    ]) {
      expect(skeleton, `skeleton key ${key}`).toHaveProperty(key);
    }
    expect(skeleton.version).toBe(1);
  });

  it("asks for genres: the word genres and genre, short names in English, and the number of genres from limits.ts", async () => {
    const text = await prompt();
    const { GENRE_LIMITS } = await loadLimits();
    expect(text).toContain("genres");
    expect(text).toMatch(/genre/i);
    const lines = text.split(/\r?\n/);
    const table = lines.find(
      (line) =>
        /\bgenres\b/.test(line) &&
        new RegExp(`\\b${GENRE_LIMITS.minCount}\\b`).test(line) &&
        new RegExp(`\\b${GENRE_LIMITS.maxCount}\\b`).test(line),
    );
    expect(table, `a line naming genres with ${GENRE_LIMITS.minCount} and ${GENRE_LIMITS.maxCount}`).toBeDefined();
    const instruction = lines.some((line) => /genre/i.test(line) && /English/.test(line)) || /English[^.]{0,120}genre|genre[^.]{0,120}English/i.test(text);
    expect(instruction, "an instruction to give genre names in English").toBe(true);
  });

  it("states the longest genre name from limits.ts", async () => {
    const { GENRE_LIMITS } = await loadLimits();
    const lines = (await prompt()).split(/\r?\n/);
    expect(lines.some((line) => /genre/i.test(line) && new RegExp(`\\b${GENRE_LIMITS.maxLength}\\b`).test(line)), `a genre line with ${GENRE_LIMITS.maxLength}`).toBe(true);
  });

  it("names no file path", async () => {
    const text = await prompt();
    expect(text).not.toMatch(/\.content/);
    expect(text).not.toMatch(/drafts[\\/]/);
    expect(text).not.toMatch(/prompts[\\/]/);
    expect(text).not.toMatch(/\.json\b/);
  });

  it("mentions every hype term (rendered from limits.ts)", async () => {
    const text = (await prompt()).toLowerCase();
    const { HYPE_TERMS } = await loadLimits();
    expect(HYPE_TERMS.filter((term) => !text.includes(term.toLowerCase()))).toEqual([]);
  });

  describe("a changed value in limits.ts changes the prompt", () => {
    afterEach(() => {
      vi.doUnmock("./limits");
      vi.resetModules();
    });

    it("renders a new about range", async () => {
      vi.resetModules();
      vi.doMock("./limits", async (importOriginal) => {
        const original = await importOriginal<typeof import("./limits")>();
        return { ...original, LIMITS: { ...original.LIMITS, about: { min: 13, max: 777 } } };
      });
      const { renderPrompt } = await import("./brief");
      const text = renderPrompt({ slug: "alpha-one", title: "Alpha One", author: "Ann Author" }, null);
      const line = text.split(/\r?\n/).find((candidate) => /\babout\b/.test(candidate) && /\b777\b/.test(candidate));
      expect(line, "a line naming about and 777").toBeDefined();
      expect(line).toMatch(/\b13\b/);
    });

    it("renders new genre limits", async () => {
      vi.resetModules();
      vi.doMock("./limits", async (importOriginal) => {
        const original = await importOriginal<typeof import("./limits")>();
        return { ...original, GENRE_LIMITS: { minCount: 2, maxCount: 7, maxLength: 33 } };
      });
      const { renderPrompt } = await import("./brief");
      const text = renderPrompt({ slug: "alpha-one", title: "Alpha One", author: "Ann Author" }, null);
      const line = text.split(/\r?\n/).find((candidate) => /\bgenres\b/.test(candidate) && /\b7\b/.test(candidate));
      expect(line, "a line naming genres and 7").toBeDefined();
      expect(line).toMatch(/\b2\b/);
      expect(text.split(/\r?\n/).some((candidate) => /genre/i.test(candidate) && /\b33\b/.test(candidate)), "a genre line with 33").toBe(true);
    });
  });
});

describe("#24 starting notes and determinism", () => {
  const BOOKS_JSON = {
    meta: { title: "fixture" },
    books: [
      {
        rank: 1,
        title: "Theo of Golden",
        author: "Allen Levi",
        genre: "Contemporary fiction (fixture genre)",
        publisher: "Fixture Press",
        first_published: "2023 (fixture edition)",
        about: "A fixture sentence about a stranger in a small town.",
        why_popular: ["Fixture reason one.", "Fixture reason two."],
        author_bio: "Fixture bio of a judge and singer.",
        sources: ["https://notes.example.com/theo", "https://notes.example.org/levi"],
      },
      {
        rank: 2,
        title: "Jane Eyre",
        author: "Charlotte Bronte",
        genre: "Gothic novel",
        publisher: "Fixture Press",
        first_published: "1847",
        about: "A fixture sentence about a governess.",
        why_popular: ["Fixture reason about Jane."],
        author_bio: "Fixture bio of a Yorkshire writer.",
        sources: ["https://notes.example.com/jane"],
      },
    ],
  };

  const MISSING = Symbol("docs/books.json is not written");

  async function notesWorkspace(booksJson: unknown = BOOKS_JSON) {
    const ws = workspace();
    ws.write("docs/book-backlog.json", backlogOf(
      { title: "Theo of Golden", author: "Allen Levi" },
      { title: "Jane Eyre", author: "Charlotte Brontë" },
      { title: "Theo of Golden: The Sequel", author: "Allen Levi" },
      { title: "Alpha One", author: "Ann Author" },
    ));
    if (booksJson !== MISSING) ws.write("docs/books.json", booksJson);
    return ws;
  }

  const promptOf = (ws: Workspace, slug: string) => {
    const result = runCli(ws, ["brief", slug, "--stdout"]);
    expect(result.code, result.text).toBe(0);
    return result.stdout;
  };

  it("adds a 'Starting notes (unverified)' section with the matching entry's text", async () => {
    const ws = await notesWorkspace();
    const text = promptOf(ws, "theo-of-golden");
    expect(text).toMatch(/Starting notes \(unverified\)/);
    for (const piece of [
      "A fixture sentence about a stranger in a small town.",
      "Fixture reason one.",
      "Fixture reason two.",
      "Fixture bio of a judge and singer.",
      "Contemporary fiction (fixture genre)",
      "Fixture Press",
      "2023 (fixture edition)",
      "https://notes.example.com/theo",
      "https://notes.example.org/levi",
    ]) {
      expect(text, piece).toContain(piece);
    }
  });

  it("matches Brontë with Bronte", async () => {
    const ws = await notesWorkspace();
    const text = promptOf(ws, "jane-eyre");
    expect(text).toMatch(/Starting notes \(unverified\)/);
    expect(text).toContain("A fixture sentence about a governess.");
  });

  it("gives no notes to a book with no match, nor to one that shares only the title or only the author", async () => {
    const ws = await notesWorkspace();
    expect(promptOf(ws, "alpha-one")).not.toMatch(/Starting notes/);
    const sequel = promptOf(ws, "theo-of-golden-the-sequel");
    expect(sequel).not.toMatch(/Starting notes/);
    expect(sequel).not.toContain("A fixture sentence about a stranger");

    const other = workspace();
    other.write("docs/book-backlog.json", backlogOf({ title: "Theo of Golden", author: "Someone Else" }));
    other.write("docs/books.json", BOOKS_JSON);
    expect(promptOf(other, "theo-of-golden")).not.toMatch(/Starting notes/);
  });

  it.each([
    ["missing", MISSING],
    ["not JSON", "{ nope"],
    ["not the expected shape", { books: "none" }],
  ])("with docs/books.json %s: exit 0 and no notes", async (_label, content) => {
    const ws = await notesWorkspace(content);
    const result = runCli(ws, ["brief", "theo-of-golden", "--stdout"]);
    expect(result.code, result.text).toBe(0);
    expect(result.stdout).not.toMatch(/Starting notes/);
  });

  it("gives byte-identical files on two runs", async () => {
    const ws = await notesWorkspace();
    expect(runCli(ws, ["brief", "--all"]).code).toBe(0);
    const first = promptFiles(ws).map((name) => [name, ws.read(name)]);
    expect(first.length).toBe(4);
    expect(runCli(ws, ["brief", "--all"]).code).toBe(0);
    expect(promptFiles(ws).map((name) => [name, ws.read(name)])).toEqual(first);
  });

  it("holds no timestamp, no contact address and no secret", async () => {
    const ws = await notesWorkspace();
    const contact = "leak-test@example.org";
    const result = runCli(ws, ["brief", "--all"], { CONTENT_CONTACT: contact, API_TOKEN: "s3cr3t-token-value" });
    expect(result.code, result.text).toBe(0);
    for (const name of promptFiles(ws)) {
      const text = ws.read(name);
      expect(text, name).not.toContain(contact);
      expect(text, name).not.toContain("s3cr3t-token-value");
      expect(text, name).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(text, name).not.toMatch(/\b20[2-9]\d-\d{2}-\d{2}\b/);
    }
    expect(nonEmptyLines(result.text).join("\n")).not.toContain(contact);
  });
});
