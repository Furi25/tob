// Spec: docs/specs/book-content-tool.md, criteria 1-18 and 41 (schema, limits, text rules, sources, facts, warnings, genres).
// In-process tests of checkDraft; see tests/support/content.ts for the assumed signature. Boundary values always come
// from LIMITS (criterion 4), never from numbers typed here, because the limits are expected to change.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  codePoints,
  draftFor,
  factFor,
  forbidRealFetch,
  isWordField,
  loadLimits,
  messages,
  names,
  SOURCE_A,
  SOURCE_B,
  sizedText,
  TEXT_FIELDS,
  textOfLength,
  validDraft,
  withPhrase,
  words,
  wordCount,
  type CheckResult,
  type Draft,
} from "../../tests/support/content";

forbidRealFetch();

type Context = { slug: string; entry: { title: string; author: string } };

async function check(draft: Draft | Record<string, unknown>, context?: Partial<Context>): Promise<CheckResult> {
  const { checkDraft } = await import("./check");
  const slug = String((draft as { slug?: unknown }).slug ?? "the-test-book");
  const title = String((draft as { title?: unknown }).title ?? "The Test Book");
  const author = String((draft as { author?: unknown }).author ?? "Ada Writer");
  return checkDraft(draft, { slug, entry: { title, author }, ...context });
}

const clean = (result: CheckResult) => {
  expect(messages(result.errors)).toBe("");
  expect(result.errors).toEqual([]);
};

describe("#1 a valid draft", () => {
  it("passes with no errors and no warnings", async () => {
    const result = await check(await validDraft());
    expect(result).toEqual({ errors: [], warnings: [] });
  });
});

describe("#2 the schema is strict", () => {
  const REQUIRED = [
    "version", "slug", "title", "author", "tagline", "summary", "about", "whyPopular", "whyItMatters", "authorBio",
    "genres", "sources", "facts", "confidence", "needsReview", "drafter",
  ] as const;

  it("rejects an unknown key and names it", async () => {
    const result = await check({ ...(await validDraft()), bogus: 1 });
    expect(names(result.errors, "bogus")).toBe(true);
  });

  it.each(REQUIRED)("rejects a draft without %s and names the field", async (field) => {
    const draft: Record<string, unknown> = { ...(await validDraft()) };
    delete draft[field];
    const result = await check(draft);
    expect(names(result.errors, field), messages(result.errors)).toBe(true);
  });

  it("rejects a version other than 1", async () => {
    const result = await check({ ...(await validDraft()), version: 2 });
    expect(names(result.errors, "version")).toBe(true);
  });

  it("rejects a confidence value that is not high, medium or low", async () => {
    const result = await check({ ...(await validDraft()), confidence: "certain" });
    expect(names(result.errors, "confidence")).toBe(true);
  });

  it.each([
    ["upper case", "The-Test-Book"],
    ["a slash", "a/b"],
    ["a leading dash", "-a"],
    ["a trailing dash", "a-"],
    ["a double dash", "a--b"],
    ["empty", ""],
    ["a dot segment", ".."],
    ["a space", "a b"],
    ["over 100 characters", "a".repeat(101)],
  ])("rejects a slug with %s", async (_label, slug) => {
    // The context slug (the file name) is the same, so only the slug rule can complain.
    const result = await check({ ...(await validDraft()), slug }, { slug });
    expect(names(result.errors, "slug"), messages(result.errors)).toBe(true);
  });

  it("accepts a slug of exactly 100 characters", async () => {
    const slug = "a".repeat(100);
    clean(await check({ ...(await validDraft()), slug }, { slug }));
  });

  it("rejects a title that differs from the backlog entry's, and an author that differs", async () => {
    const draft = await validDraft();
    expect(names((await check(draft, { entry: { title: "Another Book", author: draft.author } })).errors, "title")).toBe(true);
    expect(names((await check(draft, { entry: { title: draft.title, author: "Somebody Else" } })).errors, "author")).toBe(true);
  });

  it("compares title and author after trimming", async () => {
    const draft = await validDraft();
    clean(await check(draft, { entry: { title: `  ${draft.title} `, author: ` ${draft.author}  ` } }));
  });
});

describe("#3 the slug inside the file must equal the file name", () => {
  it("is an error when it does not", async () => {
    const result = await check(await validDraft(), { slug: "some-other-name" });
    expect(names(result.errors, "slug")).toBe(true);
  });
});

describe("#4 limits come from limits.ts", () => {
  it.each(TEXT_FIELDS)("%s: the minimum and the maximum pass, one below and one above fail", async (field) => {
    const { LIMITS } = await loadLimits();
    const { min, max } = LIMITS[field];
    const base = await validDraft();
    for (const size of [min, max]) {
      const result = await check({ ...base, [field]: sizedText(field, size) });
      expect(result.errors, `${field} at ${size}: ${messages(result.errors)}`).toEqual([]);
    }
    for (const size of [min - 1, max + 1]) {
      const result = await check({ ...base, [field]: sizedText(field, size) });
      expect(names(result.errors, field), `${field} at ${size}`).toBe(true);
    }
  });

  it.each(TEXT_FIELDS)("%s: an empty value fails", async (field) => {
    const result = await check({ ...(await validDraft()), [field]: "" });
    expect(names(result.errors, field)).toBe(true);
  });

  it("a tagline ending in a full stop fails", async () => {
    const { LIMITS } = await loadLimits();
    const tagline = `${textOfLength(Math.floor((LIMITS.tagline.min + LIMITS.tagline.max) / 2) - 1)}.`;
    const result = await check({ ...(await validDraft()), tagline });
    expect(names(result.errors, "tagline")).toBe(true);
  });

  describe("changing a limit changes what the validator enforces, with no other edit", () => {
    afterEach(() => {
      vi.doUnmock("./limits");
      vi.resetModules();
    });

    it("follows a changed limit for about", async () => {
      const base = await validDraft();
      vi.resetModules();
      vi.doMock("./limits", async (importOriginal) => {
        const original = await importOriginal<typeof import("./limits")>();
        return { ...original, LIMITS: { ...original.LIMITS, about: { min: 1, max: 10 } } };
      });
      const { checkDraft } = await import("./check");
      const context = { slug: base.slug, entry: { title: base.title, author: base.author } };
      expect(checkDraft({ ...base, about: words(10) }, context).errors).toEqual([]);
      expect(names(checkDraft({ ...base, about: words(11) }, context).errors, "about")).toBe(true);
    });
  });
});

describe("#5 how size is counted", () => {
  it("counts a hyphenated word as one word", async () => {
    const { LIMITS } = await loadLimits();
    const base = await validDraft();
    for (const field of TEXT_FIELDS.filter(isWordField)) {
      // At the maximum, two words would be one too many.
      const text = `${words(LIMITS[field].max - 1)} well-known`;
      expect(wordCount(text)).toBe(LIMITS[field].max);
      clean(await check({ ...base, [field]: text }));
    }
  });

  it("counts a character as a code point, so an emoji is one", async () => {
    const { LIMITS } = await loadLimits();
    const base = await validDraft();
    for (const field of ["tagline", "summary"] as const) {
      const text = `${textOfLength(LIMITS[field].max - 1)}😀`;
      expect(codePoints(text)).toBe(LIMITS[field].max);
      clean(await check({ ...base, [field]: text }));
    }
  });
});

describe("#6 one line, no control characters, no outer whitespace", () => {
  const VARIANTS: [string, (text: string) => string][] = [
    ["a newline", (text) => `${text}\nmore`],
    ["a carriage return and newline", (text) => `${text}\r\nmore`],
    ["a tab", (text) => `${text}\tmore`],
    ["a control character", (text) => `${text}\u0007more`],
    ["leading whitespace", (text) => ` ${text}`],
    ["trailing whitespace", (text) => `${text} `],
  ];

  describe.each(TEXT_FIELDS)("%s", (field) => {
    it.each(VARIANTS)("fails with %s", async (_label, make) => {
      const base = await validDraft();
      const result = await check({ ...base, [field]: make(base[field]) });
      expect(names(result.errors, field), messages(result.errors)).toBe(true);
    });
  });
});

describe("#7 plain text: no HTML and no Markdown", () => {
  const MARKUP: [string, (text: string) => string][] = [
    ["an HTML tag", (text) => `${text} <b>bold</b>`],
    ["a closing tag", (text) => `${text} </p>`],
    ["a backtick", (text) => `${text} a \`code\` word`],
    ["double asterisks", (text) => `${text} **bold**`],
    ["a leading #", (text) => `# ${text}`],
    ["a Markdown link", (text) => `${text} [text](http://example.com)`],
  ];

  describe.each(TEXT_FIELDS)("%s", (field) => {
    it.each(MARKUP)("fails with %s", async (_label, make) => {
      const base = await validDraft();
      const result = await check({ ...base, [field]: make(base[field]) });
      expect(names(result.errors, field), messages(result.errors)).toBe(true);
    });
  });

  it("accepts a '<' that is not followed by a letter or a slash", async () => {
    const base = await validDraft();
    clean(await check(withPhrase(base, "about", "It holds whenever a < b is true.")));
  });
});

describe("#8 placeholder words are errors, as whole words", () => {
  const BAD = ["placeholder", "PLACEHOLDER", "Lorem", "lorem", "TODO", "todo", "TBD", "tbd", "(TODO)", "TBD."];

  describe.each(TEXT_FIELDS)("%s", (field) => {
    it.each(BAD)("fails with %s", async (word) => {
      const base = await validDraft();
      const result = await check({ ...base, [field]: `${base[field]} ${word} end` });
      expect(names(result.errors, field), messages(result.errors)).toBe(true);
    });
  });

  it.each(["todos", "Placeholders"])("passes a longer word that only contains one: %s", async (word) => {
    clean(await check(withPhrase(await validDraft(), "about", `The ${word} are fine here.`)));
  });

  it("fails even in a sentence about a book called 'The Placeholder'", async () => {
    const result = await check(withPhrase(await validDraft(), "about", "A story called The Placeholder begins."));
    expect(names(result.errors, "about")).toBe(true);
  });
});

describe("#9 double-quoted spans are at most 15 words", () => {
  const QUOTES: [string, string, string][] = [
    ["straight", '"', '"'],
    ["curly", "\u201c", "\u201d"],
  ];

  it.each(QUOTES)("%s quotes: 15 words pass and 16 fail", async (_label, open, close) => {
    const base = await validDraft();
    clean(await check(withPhrase(base, "about", `He wrote ${open}${words(15)}${close} and left.`)));
    const result = await check(withPhrase(base, "about", `He wrote ${open}${words(16)}${close} and left.`));
    expect(names(result.errors, "about"), messages(result.errors)).toBe(true);
  });

  it("measures each span on its own", async () => {
    const base = await validDraft();
    clean(await check(withPhrase(base, "about", `One ${'"'}${words(10)}${'"'} and two ${'"'}${words(10, 5)}${'"'} appear.`)));
  });

  it("ignores single quotes", async () => {
    const base = await validDraft();
    clean(await check(withPhrase(base, "about", `He wrote '${words(20)}' and left.`)));
  });
});

describe("#10 sources", () => {
  const host = (i: number) => `https://site${i}.example.com/page`;
  const distinct = (count: number) => Array.from({ length: count }, (_, i) => host(i + 1));

  it.each([
    ["2 sources on 2 hostnames", [SOURCE_A, SOURCE_B]],
    ["8 sources", distinct(8)],
  ])("accepts %s", async (_label, sources) => {
    clean(await check({ ...(await validDraft()), sources }));
  });

  it.each([
    ["1 source", [SOURCE_A]],
    ["9 sources", distinct(9)],
    ["an http: URL", [SOURCE_A, "http://news.example.org/review"]],
    ["a duplicate", [SOURCE_A, SOURCE_A, SOURCE_B]],
    ["two URLs on one hostname", ["https://publisher.example.com/a", "https://publisher.example.com/b"]],
    ["something that is not a URL", [SOURCE_A, "not a url"]],
    ["a javascript: URL", [SOURCE_A, "javascript:alert(1)"]],
    ["an ftp: URL", [SOURCE_A, "ftp://files.example.org/book"]],
  ])("rejects %s", async (_label, sources) => {
    const result = await check({ ...(await validDraft()), sources });
    expect(names(result.errors, "sources"), messages(result.errors)).toBe(true);
  });
});

describe("#11 every fact cites a listed source", () => {
  it("rejects a fact whose sourceUrl is not in sources", async () => {
    const draft = withPhrase(await validDraft(), "about", "In 2023 it grew.");
    const result = await check({ ...draft, facts: [factFor("2023", "https://unlisted.example.net/page")] });
    expect(names(result.errors, "facts"), messages(result.errors)).toBe(true);
  });

  it("accepts a fact that cites a listed source", async () => {
    const draft = withPhrase(await validDraft(), "about", "In 2023 it grew.");
    clean(await check({ ...draft, facts: [factFor("2023", SOURCE_B)] }));
  });
});

describe("#12 every figure in the prose must be inside a fact's claim", () => {
  it.each([
    ["1.8 million", "1.8"],
    ["2023", "2023"],
    ["92", "92"],
    ["2,800,000", "2,800,000"],
  ])("%s: an error that names the figure without a fact, none with one", async (figure, token) => {
    const draft = withPhrase(await validDraft(), "about", `It sold ${figure} copies.`);
    const without = await check(draft);
    expect(without.errors.length, "an error for the figure").toBeGreaterThan(0);
    expect(messages(without.errors)).toContain(token);
    clean(await check({ ...draft, facts: [factFor(figure)] }));
  });

  it.each(TEXT_FIELDS)("counts a figure in %s as well", async (field) => {
    const result = await check(withPhrase(await validDraft(), field, "In 2023 it grew."));
    expect(messages(result.errors)).toContain("2023");
  });

  it("names only the figure that has no fact", async () => {
    const draft = withPhrase(await validDraft(), "about", "In 1999 it grew and in 2001 it fell.");
    const result = await check({ ...draft, facts: [factFor("1999")] });
    expect(messages(result.errors)).toContain("2001");
    expect(messages(result.errors)).not.toContain("1999");
  });
});

describe("#13 a figure that occurs in the title is exempt", () => {
  it("1984 needs no fact in the prose of 1984", async () => {
    const draft = await draftFor("1984", "George Orwell");
    clean(await check(withPhrase(draft, "about", "In 1984 the book appeared.")));
  });

  it("451 needs no fact in the prose of Fahrenheit 451, but another figure still does", async () => {
    const draft = await draftFor("Fahrenheit 451", "Ray Bradbury");
    clean(await check(withPhrase(draft, "about", "Fahrenheit 451 is about burning.")));
    const result = await check(withPhrase(draft, "about", "Fahrenheit 451 appeared in 1953."));
    expect(messages(result.errors)).toContain("1953");
    expect(messages(result.errors)).not.toContain("451");
  });

  it("does not exempt the figure for a book with another title", async () => {
    const result = await check(withPhrase(await validDraft(), "about", "In 1984 the book appeared."));
    expect(messages(result.errors)).toContain("1984");
  });
});

describe("#14 every fact's claim must occur in the prose", () => {
  it("rejects a fact whose claim is not in any text field", async () => {
    const result = await check({ ...(await validDraft()), facts: [factFor("forty-two thousand")] });
    expect(names(result.errors, "facts"), messages(result.errors)).toBe(true);
  });

  it("accepts a claim that is an exact substring of the prose, even without a figure", async () => {
    const draft = await validDraft();
    const claim = draft.about.split(" ").slice(0, 3).join(" ");
    clean(await check({ ...draft, facts: [factFor(claim)] }));
  });

  it("accepts a claim that appears in another text field", async () => {
    const draft = withPhrase(await validDraft(), "authorBio", "Born in 1970 in a small town.");
    clean(await check({ ...draft, facts: [factFor("1970")] }));
  });

  it("matches exactly: different case is not the same claim", async () => {
    const draft = withPhrase(await validDraft(), "about", "It sold 3 million copies.");
    const result = await check({ ...draft, facts: [factFor("3 MILLION")] });
    expect(names(result.errors, "facts"), messages(result.errors)).toBe(true);
  });
});

describe("#15 evidence and the number of facts", () => {
  const evidenceOf = (length: number) => "e".repeat(length);

  it.each([
    [9, false],
    [10, true],
    [300, true],
    [301, false],
  ])("evidence of %i characters passes: %s", async (length, passes) => {
    const draft = withPhrase(await validDraft(), "about", "In 2023 it grew.");
    const result = await check({ ...draft, facts: [{ claim: "2023", sourceUrl: SOURCE_A, evidence: evidenceOf(length) }] });
    if (passes) clean(result);
    else expect(names(result.errors, "facts"), messages(result.errors)).toBe(true);
  });

  const manyFacts = async (count: number) => {
    const claims = Array.from({ length: count }, (_, i) => String(1001 + i));
    const draft = withPhrase(await validDraft(), "about", claims.join(" "));
    return { ...draft, facts: claims.map((claim) => factFor(claim)) };
  };

  it("30 facts pass", async () => clean(await check(await manyFacts(30))));

  it("31 facts fail", async () => {
    const result = await check(await manyFacts(31));
    expect(names(result.errors, "facts"), messages(result.errors)).toBe(true);
  });
});

describe("#16 a draft with no figures and no facts", () => {
  it("passes", async () => {
    const draft = await validDraft();
    expect(draft.facts).toEqual([]);
    expect(await check(draft)).toEqual({ errors: [], warnings: [] });
  });
});

describe("#17 warnings are not errors", () => {
  it.each(["medium", "low"] as const)("confidence %s is a warning", async (confidence) => {
    const result = await check({ ...(await validDraft()), confidence });
    expect(result.errors).toEqual([]);
    expect(names(result.warnings, "confidence")).toBe(true);
  });

  it("a non-empty needsReview is a warning", async () => {
    const result = await check({ ...(await validDraft()), needsReview: ["The sales figure could not be confirmed."] });
    expect(result.errors).toEqual([]);
    expect(names(result.warnings, "needsReview")).toBe(true);
  });

  it("each hype term is a warning, in any case, and never an error", async () => {
    const { HYPE_TERMS } = await loadLimits();
    expect(HYPE_TERMS.length, "a non-empty hype list").toBeGreaterThan(0);
    const base = await validDraft();
    const failures: string[] = [];
    for (const term of HYPE_TERMS) {
      for (const variant of [term, term.toUpperCase()]) {
        const result = await check(withPhrase(base, "about", `A ${variant} of a tale.`));
        if (result.errors.length > 0) failures.push(`${variant}: reported as an error`);
        if (!names(result.warnings, "about")) failures.push(`${variant}: no warning`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("needsReview holds at most 10 entries of at most 300 characters", async () => {
    const base = await validDraft();
    expect(names((await check({ ...base, needsReview: Array.from({ length: 11 }, () => "note") })).errors, "needsReview")).toBe(true);
    expect(names((await check({ ...base, needsReview: ["n".repeat(301)] })).errors, "needsReview")).toBe(true);
    expect((await check({ ...base, needsReview: Array.from({ length: 10 }, () => "n".repeat(300)) })).errors).toEqual([]);
  });
});

describe("#18 the hype list lives only in limits.ts", () => {
  it("no other source file of the tool repeats a hype term", async () => {
    const { HYPE_TERMS } = await loadLimits();
    const folder = path.join(process.cwd(), "scripts", "content");
    const files = readdirSync(folder).filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== "limits.ts");
    expect(files.length, "the tool's source files exist").toBeGreaterThan(0);
    const offenders = files.flatMap((name) => {
      const text = readFileSync(path.join(folder, name), "utf8").toLowerCase();
      return HYPE_TERMS.filter((term) => text.includes(term.toLowerCase())).map((term) => `${name} repeats "${term}"`);
    });
    expect(offenders).toEqual([]);
  });
});

describe("#41 genres", () => {
  const withGenres = async (genres: unknown) => ({ ...(await validDraft()), genres }) as Record<string, unknown>;
  const issueAt = (result: CheckResult, field: string) => result.errors.some((issue) => issue.field === field);
  const listLevel = (result: CheckResult) => result.errors.some((issue) => issue.field === "genres");

  const genreList = (count: number) => ["Gothic fiction", "Science fiction", "Historical novel", "Mystery", "Satire"].slice(0, count);

  it("limits.ts exports GENRE_LIMITS, and its first values are 1, 5 and 40", async () => {
    const { GENRE_LIMITS } = await loadLimits();
    expect(GENRE_LIMITS).toEqual({ minCount: 1, maxCount: 5, maxLength: 40 });
  });

  it.each([1, 2, 5])("a list of %i genres passes", async (count) => {
    const { GENRE_LIMITS } = await loadLimits();
    expect(count).toBeGreaterThanOrEqual(GENRE_LIMITS.minCount);
    expect(count).toBeLessThanOrEqual(GENRE_LIMITS.maxCount);
    expect(await check(await withGenres(genreList(count)))).toEqual({ errors: [], warnings: [] });
  });

  it("the number of genres is held to minCount and maxCount: one below and one above fail, both named `genres`", async () => {
    const { GENRE_LIMITS } = await loadLimits();
    const distinct = (count: number) => Array.from({ length: count }, (_, i) => `Genre ${words(1, i)}`);
    for (const count of [GENRE_LIMITS.minCount, GENRE_LIMITS.maxCount]) {
      clean(await check(await withGenres(distinct(count))));
    }
    for (const count of [GENRE_LIMITS.minCount - 1, GENRE_LIMITS.maxCount + 1]) {
      const result = await check(await withGenres(distinct(count)));
      expect(listLevel(result), `${count} genres: ${messages(result.errors)}`).toBe(true);
    }
  });

  it("an empty list and a list of 6 are errors that name `genres`", async () => {
    for (const genres of [[], [...genreList(5), "Fantasy"]]) {
      const result = await check(await withGenres(genres));
      expect(listLevel(result), `${genres.length} genres: ${messages(result.errors)}`).toBe(true);
    }
  });

  it("an entry is held to 1..maxLength characters: the longest passes, one more fails, an empty one fails, naming `genres.<index>`", async () => {
    const { GENRE_LIMITS } = await loadLimits();
    clean(await check(await withGenres(["Gothic fiction", textOfLength(GENRE_LIMITS.maxLength)])));
    const long = await check(await withGenres(["Gothic fiction", textOfLength(GENRE_LIMITS.maxLength + 1)]));
    expect(issueAt(long, "genres.1"), messages(long.errors)).toBe(true);
    const empty = await check(await withGenres(["Gothic fiction", ""]));
    expect(issueAt(empty, "genres.1"), messages(empty.errors)).toBe(true);
    const first = await check(await withGenres(["", "Gothic fiction"]));
    expect(issueAt(first, "genres.0"), messages(first.errors)).toBe(true);
  });

  it("counts an entry's length as code points, so an emoji is one character", async () => {
    const { GENRE_LIMITS } = await loadLimits();
    const entry = `${textOfLength(GENRE_LIMITS.maxLength - 1)}😀`;
    expect(codePoints(entry)).toBe(GENRE_LIMITS.maxLength);
    clean(await check(await withGenres([entry])));
  });

  it("two entries that differ only in case are an error; entries that differ in a letter are not", async () => {
    const same = await check(await withGenres(["Gothic fiction", "gothic FICTION"]));
    expect(names(same.errors, "genres"), messages(same.errors)).toBe(true);
    const exact = await check(await withGenres(["Mystery", "Mystery"]));
    expect(names(exact.errors, "genres"), messages(exact.errors)).toBe(true);
    clean(await check(await withGenres(["Gothic fiction", "Gothic fictions"])));
  });

  describe("text rules 1-3 apply to every entry", () => {
    const BAD: [string, string][] = [
      ["a newline", "Gothic\nfiction"],
      ["a carriage return and newline", "Gothic\r\nfiction"],
      ["a tab", "Gothic\tfiction"],
      ["a control character", "Gothic\u0007fiction"],
      ["leading whitespace", " Gothic fiction"],
      ["trailing whitespace", "Gothic fiction "],
      ["an HTML tag", "<b>Gothic</b>"],
      ["a closing tag", "Gothic</p>"],
      ["a backtick", "`Gothic` fiction"],
      ["double asterisks", "**Gothic** fiction"],
      ["a leading #", "# Gothic fiction"],
      ["a Markdown link", "[Gothic](http://example.com)"],
      ["the word placeholder", "Placeholder"],
      ["the word lorem", "Lorem fiction"],
      ["the word TODO", "TODO"],
      ["the word TBD", "genre TBD"],
    ];

    it.each(BAD)("fails with %s, naming that entry", async (_label, entry) => {
      const result = await check(await withGenres(["Gothic fiction", entry]));
      expect(issueAt(result, "genres.1"), messages(result.errors)).toBe(true);
    });
  });

  it("rules 4 and 5 do not apply: a genre with digits needs no fact, and a quoted span is not held to 15 words", async () => {
    clean(await check(await withGenres(["20th-century fiction", "Fiction of 1984"])));
    // Sixteen one-letter words in quotes fit in 40 characters; in prose this would break rule 4.
    const quoted = `"${"a b c d e f g h i j k l m n o p"}"`;
    expect(wordCount(quoted)).toBe(16);
    expect(codePoints(quoted)).toBeLessThanOrEqual((await loadLimits()).GENRE_LIMITS.maxLength);
    clean(await check(await withGenres(["Gothic fiction", quoted])));
  });

  it.each([
    ["a number", [5]],
    ["null", [null]],
    ["an object", [{ name: "Gothic fiction" }]],
    ["a nested array", [["Gothic fiction"]]],
    ["a boolean", [true]],
  ])("an entry that is %s is an error naming that entry", async (_label, entries) => {
    const result = await check(await withGenres(["Gothic fiction", ...entries]));
    expect(issueAt(result, "genres.1"), messages(result.errors)).toBe(true);
  });

  it.each([
    ["a string instead of a list", "Gothic fiction"],
    ["null", null],
    ["an object", { 0: "Gothic fiction" }],
    ["a number", 3],
  ])("`genres` as %s is an error naming `genres`, and checkDraft does not throw", async (_label, genres) => {
    const result = await check(await withGenres(genres));
    expect(names(result.errors, "genres"), messages(result.errors)).toBe(true);
  });

  it("a missing `genres` (the earlier draft format) is an error naming `genres`", async () => {
    const draft = await withGenres(undefined);
    delete draft.genres;
    const result = await check(draft);
    expect(names(result.errors, "genres"), messages(result.errors)).toBe(true);
  });

  describe("the boundaries come from limits.ts", () => {
    afterEach(() => {
      vi.doUnmock("./limits");
      vi.resetModules();
    });

    it("follows a changed GENRE_LIMITS with no other edit", async () => {
      const base = await validDraft();
      vi.resetModules();
      vi.doMock("./limits", async (importOriginal) => {
        const original = await importOriginal<typeof import("./limits")>();
        return { ...original, GENRE_LIMITS: { minCount: 2, maxCount: 3, maxLength: 8 } };
      });
      const { checkDraft } = await import("./check");
      const context = { slug: base.slug, entry: { title: base.title, author: base.author } };
      const run = (genres: string[]) => checkDraft({ ...base, genres }, context);

      expect(run(["abcdefgh", "b"]).errors).toEqual([]);
      expect(run(["a", "b", "c"]).errors).toEqual([]);
      expect(names(run(["a"]).errors, "genres"), "one genre is now too few").toBe(true);
      expect(names(run(["a", "b", "c", "d"]).errors, "genres"), "four genres are now too many").toBe(true);
      expect(names(run(["a", "abcdefghi"]).errors, "genres"), "nine characters are now too long").toBe(true);
    });
  });
});
