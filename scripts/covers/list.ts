// The list file: one book per line, `Title | Author | ISBN` (docs/specs/book-cover-fetcher.md, "Input").
import { slugify } from "../../src/lib/slug";

export const MAX_BOOKS = 100;
const MAX_FIELD = 200;

export type BookEntry = { line: number; slug: string; title: string; author: string; isbn: string | null };
export type ListError = { line: number; message: string };
export type ParsedList = { ok: true; books: BookEntry[] } | { ok: false; errors: ListError[] };

/** ISBN-10 or ISBN-13 with a valid check digit. Takes digits only (a trailing X is allowed on ISBN-10). */
function hasValidCheckDigit(digits: string): boolean {
  if (/^\d{13}$/.test(digits)) {
    const sum = [...digits].reduce((total, ch, i) => total + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(digits)) {
    const sum = [...digits].reduce((total, ch, i) => total + (ch === "X" ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}

function parseLine(raw: string, line: number): { entry: BookEntry } | { error: string } {
  const fields = raw.split("|").map((field) => field.trim());
  if (fields.length < 2 || fields.length > 3) return { error: "expected `Title | Author` or `Title | Author | ISBN`" };

  const [title, author, isbnField] = fields;
  if (title.length === 0) return { error: "the title is empty" };
  if (title.length > MAX_FIELD) return { error: `the title is longer than ${MAX_FIELD} characters` };
  if (author.length === 0) return { error: "the author is empty" };
  if (author.length > MAX_FIELD) return { error: `the author is longer than ${MAX_FIELD} characters` };

  const slug = slugify(title);
  if (slug.length === 0) return { error: "the title has no letters or digits, so it makes no file name" };

  let isbn: string | null = null;
  if (isbnField !== undefined) {
    const digits = isbnField.replace(/[-\s]/g, "").toUpperCase();
    if (!hasValidCheckDigit(digits)) return { error: "the ISBN is not a valid ISBN-10 or ISBN-13" };
    isbn = digits;
  }
  return { entry: { line, slug, title, author, isbn } };
}

export function parseBookList(text: string): ParsedList {
  const books: BookEntry[] = [];
  const errors: ListError[] = [];
  const firstLineOfSlug = new Map<string, number>();

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;

    const parsed = parseLine(trimmed, line);
    if ("error" in parsed) {
      errors.push({ line, message: parsed.error });
      return;
    }
    const earlier = firstLineOfSlug.get(parsed.entry.slug);
    if (earlier !== undefined) {
      errors.push({ line, message: `the file name "${parsed.entry.slug}" is already used by line ${earlier}` });
      return;
    }
    firstLineOfSlug.set(parsed.entry.slug, line);
    books.push(parsed.entry);
  });

  if (books.length === 0 && errors.length === 0) errors.push({ line: 0, message: "the list has no books" });
  if (books.length > MAX_BOOKS) errors.push({ line: 0, message: `the list has ${books.length} books; the limit is ${MAX_BOOKS}` });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, books };
}
