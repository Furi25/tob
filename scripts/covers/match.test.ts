// Spec: docs/specs/book-cover-fetcher.md, criterion 30 (matching rule). See tests/support/covers.ts for the assumed
// titleMatches / authorMatches signatures.
//
// SPEC CONFLICT, flagged for the architect: criterion 30 says `The Hobbit` does NOT match `The Hobbit Companion`, but the
// matching rule says a candidate matches when it "starts with [the title] followed by a word boundary (a subtitle)", and
// "Companion" follows a word boundary just as "Deluxe Edition" does in `Dune: Deluxe Edition`, which must match. Once
// punctuation is normalised to spaces, the two cases cannot be told apart by the rule as written. The tests below follow
// the criterion (the numbered, testable statement). The "Companion" case is isolated in its own test.
import { describe, expect, it } from "vitest";

const title = async (listTitle: string, candidate: string) => (await import("./match")).titleMatches(listTitle, candidate);
const author = async (listAuthor: string, candidates: readonly string[]) => (await import("./match")).authorMatches(listAuthor, candidates);

describe("#30 titles that match", () => {
  it.each([
    ["The Hobbit", "The Hobbit"],
    ["The Hobbit", "the hobbit"],
    ["The Hobbit", "THE HOBBIT!"],
    ["The Hobbit", "Hobbit"],
    ["Hobbit", "The Hobbit"],
    ["Les Misérables", "Les Miserables"],
    ["Les Miserables", "Les Misérables"],
    ["Pride & Prejudice", "Pride and Prejudice"],
    ["Pride and Prejudice", "Pride & Prejudice"],
    ["Fahrenheit 451", "Fahrenheit 451: A Novel"],
    ["Dune", "Dune: Deluxe Edition"],
    ["A Tale of Two Cities", "Tale of Two Cities"],
    ["An Inspector Calls", "Inspector Calls"],
    ["Mr. Mercedes", "Mr Mercedes"],
    ["  Dune  ", "Dune"],
  ])("%j matches %j", async (listTitle, candidate) => {
    expect(await title(listTitle, candidate)).toBe(true);
  });
});

describe("#30 titles that do not match", () => {
  it.each([
    ["The Hobbit", "SparkNotes: The Hobbit"],
    ["The Hobbit", "A Study Guide to The Hobbit"],
    ["The Hobbit", "Hobbits"],
    ["Dune", "Dunes"],
    ["Dune", "Children of Dune"],
    ["Dune", "Sand Dune Ecology"],
    ["The Hobbit", "The Lord of the Rings"],
    ["Dune", ""],
  ])("%j does not match %j", async (listTitle, candidate) => {
    expect(await title(listTitle, candidate)).toBe(false);
  });

  it("The Hobbit does not match The Hobbit Companion (criterion 30; conflicts with the rule text, see the header)", async () => {
    expect(await title("The Hobbit", "The Hobbit Companion")).toBe(false);
  });
});

describe("#30 authors", () => {
  it.each<[string, string[]]>([
    ["J.R.R. Tolkien", ["J. R. R. Tolkien"]],
    ["J.R.R. Tolkien", ["John Ronald Reuel Tolkien"]],
    ["J.R.R. Tolkien", ["Someone Else", "J. R. R. Tolkien"]],
    ["Gabriel García Márquez", ["Gabriel Garcia Marquez"]],
    ["Neil Gaiman & Terry Pratchett", ["Neil Gaiman"]],
    ["Neil Gaiman & Terry Pratchett", ["Terry Pratchett"]],
    ["Neil Gaiman & Terry Pratchett", ["Terry Pratchett", "Neil Gaiman"]],
    ["Terry Pratchett and Neil Gaiman", ["Neil Gaiman"]],
    ["Terry Pratchett, Neil Gaiman", ["Terry Pratchett"]],
    ["ray bradbury", ["Ray Bradbury"]],
  ])("%j matches %j", async (listAuthor, candidates) => {
    expect(await author(listAuthor, candidates)).toBe(true);
  });

  it.each<[string, string[]]>([
    ["J.R.R. Tolkien", ["Stephen King"]],
    ["J.R.R. Tolkien", ["Tolkienesque Fan"]],
    ["J.R.R. Tolkien", []],
    ["Neil Gaiman & Terry Pratchett", ["Stephen King"]],
  ])("%j does not match %j", async (listAuthor, candidates) => {
    expect(await author(listAuthor, candidates)).toBe(false);
  });
});
