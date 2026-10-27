// Shared helpers for docs/specs/content-import.md: fixture content files and a seed runner that never reads the
// developer's real .content/books-content.json.
//
// This module is deliberately free of vitest and sharp, so Playwright specs can import it too. It is the only place
// outside prisma/seed.ts that names the content file and the BOOK_CONTENT_FILE override: tests/e2e must not mention
// them (criterion 16), so e2e specs go through the helpers below.
//
// SEED CONTRACT, pinned in the spec ("Content file source", "API Contracts"):
//   - the seed reads the path in the environment variable BOOK_CONTENT_FILE, else `.content/books-content.json`
//     relative to the current directory (the repo root);
//   - an explicit path that does not exist is an error (exit 1); an absent default file is not (exit 0);
//   - the console says `content applied to N books, ignored M entries (<slugs>)`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONTENT_ENV_VAR = "BOOK_CONTENT_FILE";
export const DEFAULT_CONTENT_FILE = path.join(process.cwd(), ".content", "books-content.json");

/** Abbey slot that Anathem takes over (decided 2026-10-26). */
export const ANATHEM_SLOT = 1;
export const ANATHEM_SCENE = "abbey";

export type ApprovedEntry = {
  version: 1;
  slug: string;
  title: string;
  author: string;
  tagline: string;
  summary: string;
  about: string;
  whyPopular: string;
  whyItMatters: string;
  authorBio: string;
  genres: string[];
  sources: string[];
  facts: { claim: string; sourceUrl: string; evidence: string }[];
  confidence: "high" | "medium" | "low";
  needsReview: string[];
  drafter: string;
  review: {
    approvedAt: string;
    verification: "complete" | "partial" | "skipped";
    warningsAccepted: boolean;
    draftSha256: string;
  };
};

/** Strings that only exist in fields the database must NOT store (criterion 4). */
export const NEVER_STORED = {
  source: "https://never-stored.example.org/marker-source",
  claim: "NEVER-STORED-CLAIM-MARKER",
  evidence: "NEVER-STORED-EVIDENCE-MARKER",
  needsReview: "NEVER-STORED-NEEDS-REVIEW-MARKER",
  drafter: "NEVER-STORED-DRAFTER-MARKER",
} as const;

/** A complete approved entry. Text fields carry the slug, so a test can tell whose copy it is looking at. */
export function approvedEntry(
  slug: string,
  title: string,
  author: string,
  over: Partial<ApprovedEntry> = {},
): ApprovedEntry {
  return {
    version: 1,
    slug,
    title,
    author,
    tagline: `TAGLINE-${slug} a one-line hook`,
    summary: `SUMMARY-${slug} a spoiler-free pitch of the book, written for the meta description`,
    about: `ABOUT-${slug} what the book is about, as far as the opening set-up`,
    whyPopular: `WHYPOPULAR-${slug} why readers pick it up and pass it on`,
    whyItMatters: `WHYITMATTERS-${slug} what lasting value it has`,
    authorBio: `AUTHORBIO-${slug} who ${author} is and what else they wrote`,
    genres: ["Genre one", "Genre two"],
    sources: [NEVER_STORED.source, "https://second-source.example.com/page"],
    facts: [{ claim: NEVER_STORED.claim, sourceUrl: NEVER_STORED.source, evidence: NEVER_STORED.evidence }],
    confidence: "medium",
    needsReview: [NEVER_STORED.needsReview],
    drafter: NEVER_STORED.drafter,
    review: {
      approvedAt: "2026-10-26T20:00:00.000Z",
      verification: "partial",
      warningsAccepted: true,
      draftSha256: "0".repeat(64),
    },
    ...over,
  };
}

/** A classic that is already in the seed (slug the-hobbit, same title and author as the seed). */
export const HOBBIT = approvedEntry("the-hobbit", "The Hobbit", "J.R.R. Tolkien", {
  genres: ["Fantasy", "Adventure fiction"],
});

/** The first real book that replaces an Abbey placeholder (slot 1). */
export const ANATHEM = approvedEntry("anathem", "Anathem", "Neal Stephenson", {
  genres: ["Science fiction", "Philosophical science fiction", "Speculative fiction"],
});

export const contentFile = (...books: ApprovedEntry[]) => ({
  version: 1,
  generated: "2026-10-26T20:00:00.000Z",
  books: [...books].sort((a, b) => a.slug.localeCompare(b.slug)),
});

// ------------------------------------------------------------------------------------------------ fixture files

const folders: string[] = [];

/** Writes a fixture content file (an object is serialised, a string is written as is) and returns its path. */
export function writeContentFixture(content: object | string, name = "books-content.json"): string {
  const folder = mkdtempSync(path.join(os.tmpdir(), "tob-content-import-"));
  folders.push(folder);
  const file = path.join(folder, name);
  writeFileSync(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return file;
}

export function removeContentFixtures(): void {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
}

/** One shared valid file with no books in it. Idempotent, so Vitest and Playwright may both create it. */
export function emptyContentFile(): string {
  const file = path.join(os.tmpdir(), "tob-content-import-empty.json");
  if (!existsSync(file)) writeFileSync(file, `${JSON.stringify(contentFile(), null, 2)}\n`, "utf8");
  return file;
}

// ------------------------------------------------------------------------------------------------ the seed

export type SeedResult = { status: number | null; stdout: string; stderr: string; text: string };

/**
 * The environment for a seed run that must ignore the developer's real .content folder: BOOK_CONTENT_FILE points at a
 * valid file with no books, so the seed produces plain placeholders. Used by every test that only needs "a seeded database".
 */
export function isolatedSeedEnv(): NodeJS.ProcessEnv {
  return { ...process.env, [CONTENT_ENV_VAR]: emptyContentFile() };
}

/**
 * Runs `npx prisma db seed` from the repo root and returns the outcome without throwing.
 * `file`: a path sets BOOK_CONTENT_FILE; `null` removes the variable, so the seed falls back to its default path.
 */
export function runSeed(file: string | null): SeedResult {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (file === null) delete env[CONTENT_ENV_VAR];
  else env[CONTENT_ENV_VAR] = file;
  const result = spawnSync("npx", ["prisma", "db", "seed"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 120_000,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { status: result.status, stdout, stderr, text: `${stdout}\n${stderr}` };
}

/** Seeds from a fixture containing exactly these entries. Throws when the seed fails. */
export function seedWithContent(...books: ApprovedEntry[]): SeedResult {
  const result = runSeed(writeContentFixture(contentFile(...books)));
  if (result.status !== 0) throw new Error(`seed exited with ${result.status}\n${result.text}`);
  return result;
}

/** Seeds placeholders only. Throws when the seed fails. */
export function seedPlaceholdersOnly(): SeedResult {
  const result = runSeed(emptyContentFile());
  if (result.status !== 0) throw new Error(`seed exited with ${result.status}\n${result.text}`);
  return result;
}
