// Spec: docs/specs/book-cover-fetcher.md, criteria 6–10 (list parsing). See tests/support/covers.ts for the assumed
// parseBookList signature.
import { describe, expect, it } from "vitest";

const parse = async (text: string) => (await import("./list")).parseBookList(text);

async function books(text: string) {
  const result = await parse(text);
  if (!result.ok) throw new Error(`expected a valid list, got ${JSON.stringify(result.errors)}`);
  return result.books;
}

async function errors(text: string) {
  const result = await parse(text);
  if (result.ok) throw new Error("expected the list to be rejected");
  return result.errors;
}

const lines = (count: number) => Array.from({ length: count }, (_, i) => `Book Number ${i + 1} | Author ${i + 1}`).join("\n");

describe("#6 a valid list", () => {
  it("gives one entry per book line, with trimmed fields, line numbers, slugs and a null ISBN when absent", async () => {
    const result = await books("# my list\n\n  The Hobbit  |  J.R.R. Tolkien \nFahrenheit 451 | Ray Bradbury\n");
    expect(result).toEqual([
      { line: 3, slug: "the-hobbit", title: "The Hobbit", author: "J.R.R. Tolkien", isbn: null },
      { line: 4, slug: "fahrenheit-451", title: "Fahrenheit 451", author: "Ray Bradbury", isbn: null },
    ]);
  });

  it("accepts several authors in one field", async () => {
    const [book] = await books("Good Omens | Neil Gaiman & Terry Pratchett");
    expect(book.author).toBe("Neil Gaiman & Terry Pratchett");
  });

  it("ignores comment lines, blank lines and whitespace-only lines", async () => {
    const result = await books("# only a comment\n\n   \n\t\nDune | Frank Herbert\n#Another | Comment");
    expect(result.map((b) => b.slug)).toEqual(["dune"]);
    expect(result[0].line).toBe(5);
  });

  it("accepts a byte-order mark and Windows line endings", async () => {
    const result = await books("\uFEFFThe Hobbit | J.R.R. Tolkien\r\nDune | Frank Herbert\r\n");
    expect(result.map((b) => [b.line, b.slug, b.title, b.author])).toEqual([
      [1, "the-hobbit", "The Hobbit", "J.R.R. Tolkien"],
      [2, "dune", "Dune", "Frank Herbert"],
    ]);
  });
});

describe("#7 ISBNs", () => {
  it.each([
    ["978-0-06-085398-3", "9780060853983"],
    ["9780306406157", "9780306406157"],
    ["0 306 40615 2", "0306406152"],
    ["0-8044-2957-X", "080442957X"],
  ])("accepts %j and stores the digits %j", async (isbn, digits) => {
    const [book] = await books(`Some Title | Some Author | ${isbn}`);
    expect(book.isbn).toBe(digits);
  });

  it.each([
    ["a wrong ISBN-13 check digit", "9780306406158"],
    ["a wrong ISBN-10 check digit", "0306406153"],
    ["a too short number", "12345"],
    ["a number of 12 digits", "978030640615"],
    ["letters", "97803064O6157"],
    ["an X in the middle", "03064X6152"],
  ])("rejects %s and names the line", async (_label, isbn) => {
    const result = await errors(`Fine Book | Fine Author\nBad Book | Bad Author | ${isbn}`);
    expect(result.map((e) => e.line)).toContain(2);
    expect(result.map((e) => e.line)).not.toContain(1);
  });
});

describe("#8 invalid lines", () => {
  it.each([
    ["a missing author (one field)", "Just A Title"],
    ["an empty author", "A Title |   "],
    ["an empty title", "   | An Author"],
    ["a title over 200 characters", `${"x".repeat(201)} | An Author`],
    ["an author over 200 characters", `A Title | ${"y".repeat(201)}`],
    ["more than three fields", "A Title | An Author | 9780306406157 | extra"],
    ["a title with an empty slug", "!!! | An Author"],
  ])("rejects %s and names its line", async (_label, bad) => {
    const result = await errors(`Fine Book | Fine Author\n${bad}\nAnother Fine | Fine Author`);
    expect(result.map((e) => e.line)).toEqual([2]);
  });

  it("accepts a title and an author of exactly 200 characters", async () => {
    const result = await books(`${"x".repeat(200)} | ${"y".repeat(200)}`);
    expect(result).toHaveLength(1);
  });

  it("reports every bad line, not only the first", async () => {
    const result = await errors("Just A Title\nFine | Fine\n!!! | Nobody");
    expect(result.map((e) => e.line).sort()).toEqual([1, 3]);
  });
});

describe("#9 duplicate slugs", () => {
  it("is an error that names both lines", async () => {
    const result = await errors("The Hobbit | J.R.R. Tolkien\nDune | Frank Herbert\nthe  hobbit! | Someone Else");
    const text = JSON.stringify(result);
    expect(text).toMatch(/\b1\b/);
    expect(text).toMatch(/\b3\b/);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("#10 size of the list", () => {
  it("rejects a list with no books", async () => {
    expect((await errors("")).length).toBeGreaterThan(0);
    expect((await errors("# only comments\n\n")).length).toBeGreaterThan(0);
  });

  it("accepts 100 books and rejects 101", async () => {
    expect(await books(lines(100))).toHaveLength(100);
    expect((await errors(lines(101))).length).toBeGreaterThan(0);
  });
});
