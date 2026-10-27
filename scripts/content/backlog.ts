// The backlog: the list of books the tool works on (docs/specs/book-content-tool.md, "Backlog").
import { z } from "zod";
import { slugify } from "../../src/lib/slug";
import { MAX_BACKLOG_BOOKS, MAX_NAME_LENGTH, MAX_NOTES_LENGTH, MAX_SLUG_LENGTH } from "./limits";

export type BacklogBook = {
  slug: string;
  title: string;
  author: string;
  isbn?: string;
  origin: "classics" | "bestsellers" | "other";
  notes?: string;
};

export type BacklogResult = { ok: true; books: BacklogBook[] } | { ok: false; errors: string[] };

/** ISBN-10 or ISBN-13 with a valid check digit. Hyphens and spaces are allowed; a trailing X is allowed on ISBN-10. */
export function isValidIsbn(value: string): boolean {
  const digits = value.replace(/[-\s]/g, "").toUpperCase();
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

const EntrySchema = z.strictObject({
  title: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  author: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  isbn: z
    .string()
    .refine(isValidIsbn, "is not a valid ISBN-10 or ISBN-13")
    .optional(),
  origin: z.enum(["classics", "bestsellers", "other"]),
  notes: z.string().max(MAX_NOTES_LENGTH).optional(),
});

const FileSchema = z.strictObject({ version: z.literal(1), books: z.array(z.unknown()) });

function describeEntry(raw: unknown, index: number): string {
  const title = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).title : undefined;
  return typeof title === "string" && title.trim() !== "" ? `books[${index}] "${title.trim()}"` : `books[${index}]`;
}

/** Reads and checks the backlog text. Every problem is returned, each naming the entry it belongs to. */
export function parseBacklog(text: string): BacklogResult {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, errors: ["the backlog is not valid JSON"] };
  }
  const file = FileSchema.safeParse(json);
  if (!file.success) {
    return {
      ok: false,
      errors: file.error.issues.map((issue) => `the backlog${issue.path.length > 0 ? ` (${issue.path.join(".")})` : ""}: ${issue.message}`),
    };
  }
  if (file.data.books.length > MAX_BACKLOG_BOOKS) {
    return { ok: false, errors: [`the backlog has ${file.data.books.length} books; the most allowed is ${MAX_BACKLOG_BOOKS}`] };
  }

  const errors: string[] = [];
  const books: BacklogBook[] = [];
  const firstWithSlug = new Map<string, string>();
  file.data.books.forEach((raw, index) => {
    const name = describeEntry(raw, index);
    const entry = EntrySchema.safeParse(raw);
    if (!entry.success) {
      for (const issue of entry.error.issues) {
        const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        const keys = issue.code === "unrecognized_keys" ? `${issue.keys.join(", ")}: ` : "";
        errors.push(`${name}: ${where}${keys}${issue.message}`);
      }
      return;
    }
    const slug = slugify(entry.data.title);
    if (slug.length === 0) {
      errors.push(`${name}: the title has no letters or digits, so it makes no file name`);
      return;
    }
    if (slug.length > MAX_SLUG_LENGTH) {
      errors.push(`${name}: the title makes a file name longer than ${MAX_SLUG_LENGTH} characters`);
      return;
    }
    const earlier = firstWithSlug.get(slug);
    if (earlier !== undefined) {
      errors.push(`${name}: the file name "${slug}" is already used by ${earlier}`);
      return;
    }
    firstWithSlug.set(slug, name);
    books.push({ slug, ...entry.data });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, books };
}

export type BookStatus = "new" | "briefed" | "drafted" | "approved";
export const STATUS_ORDER: readonly BookStatus[] = ["new", "briefed", "drafted", "approved"];

/** The most advanced stage a book has reached, from which files exist. */
export function deriveStatus(files: { prompt: boolean; draft: boolean; approved: boolean }): BookStatus {
  if (files.approved) return "approved";
  if (files.draft) return "drafted";
  if (files.prompt) return "briefed";
  return "new";
}

/** The `Title | Author | ISBN` line the cover tool reads. */
export function listLine(book: BacklogBook): string {
  return book.isbn === undefined ? `${book.title} | ${book.author}` : `${book.title} | ${book.author} | ${book.isbn}`;
}
