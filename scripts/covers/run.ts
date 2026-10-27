// One whole run (docs/specs/book-cover-fetcher.md, "Behaviour"). It takes its network, clock and stop signal as
// arguments, so tests need no network and no real waiting. It prints one line per book and never prints the contact
// address or the API key.
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Config } from "./config";
import { createHttp, type Budget } from "./http";
import { MIN_WIDTH, normalizeCover, type NormalizeResult, type Size } from "./image";
import { parseBookList, type BookEntry } from "./list";
import { readReport, writeReport, type Attempt, type Outcome, type Report, type ReportEntry, type SourceName } from "./report";
import { lookupCommons } from "./sources/commons";
import { lookupGoogleBooks } from "./sources/google-books";
import { MANUAL_RIGHTS, readManualFile } from "./sources/manual";
import { lookupOpenLibrary } from "./sources/openlibrary";
import type { Lookup } from "./sources/types";

export const BOOK_BUDGET = 12;
export const BREAKER_LIMIT = 2;

export type RunDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
};

export type RunOptions = {
  listText: string;
  outDir: string;
  force?: boolean;
  only?: string;
  config: Pick<Config, "contact" | "googleBooksApiKey">;
  deps?: RunDeps;
};

type Breaker = { consecutive: number; disabled: boolean };
type Accepted = { source: SourceName; sourceUrl: string; rights: string; result: Extract<NormalizeResult, { ok: true }> };

const ONLINE_SOURCES = ["openlibrary", "google-books", "wikimedia-commons"] as const;

const imageFile = (slug: string) => `images/${slug}.png`;

/** A file from an earlier run is kept only if it is a readable PNG, 2:3, at least 400 px wide. */
async function isValidExisting(file: string): Promise<boolean> {
  try {
    const bytes = await readFile(file);
    const { data, info } = await sharp(bytes, { limitInputPixels: 100_000_000 }).raw().toBuffer({ resolveWithObject: true });
    const meta = await sharp(bytes).metadata();
    return data.length > 0 && meta.format === "png" && info.width * 3 === info.height * 2 && info.width >= MIN_WIDTH;
  } catch {
    return false;
  }
}

async function removeStaleTemporaryFiles(outDir: string, imagesDir: string): Promise<void> {
  const names = await readdir(imagesDir).catch(() => [] as string[]);
  await Promise.all(names.filter((name) => name.endsWith(".tmp")).map((name) => rm(path.join(imagesDir, name), { force: true })));
  await rm(path.join(outDir, "report.json.tmp"), { force: true });
}

const emptyEntry = (book: BookEntry): ReportEntry => ({
  slug: book.slug,
  title: book.title,
  author: book.author,
  isbn: book.isbn,
  status: "missing",
  file: null,
  source: null,
  sourceUrl: null,
  rights: null,
  originalSize: null,
  outputSize: null,
  cropped: null,
  attempts: [],
});

const sizeText = (size: Size | null) => (size ? `${size.width}x${size.height}` : "");

export async function runCovers(options: RunOptions): Promise<{ exitCode: number }> {
  const { outDir, config } = options;
  const signal = options.deps?.signal;

  const parsed = parseBookList(options.listText);
  if (!parsed.ok) {
    for (const error of parsed.errors) console.error(error.line > 0 ? `line ${error.line}: ${error.message}` : error.message);
    return { exitCode: 2 };
  }
  const selected = options.only === undefined ? parsed.books : parsed.books.filter((book) => book.slug === options.only);
  if (selected.length === 0) {
    console.error(`--only ${options.only ?? ""}: no book with that slug in the list`);
    return { exitCode: 2 };
  }

  const imagesDir = path.join(outDir, "images");
  try {
    await mkdir(imagesDir, { recursive: true });
  } catch {
    console.error("cannot create the output folder");
    return { exitCode: 2 };
  }
  await removeStaleTemporaryFiles(outDir, imagesDir);
  const previous = await readReport(outDir);

  const http = createHttp({ contact: config.contact, fetch: options.deps?.fetch, sleep: options.deps?.sleep, now: options.deps?.now });
  const breakers = new Map<SourceName, Breaker>();
  const breaker = (source: SourceName) => {
    let state = breakers.get(source);
    if (!state) breakers.set(source, (state = { consecutive: 0, disabled: false }));
    return state;
  };
  /** Counts a result for the circuit breaker: out-of-retries failures in a row switch the source off for the run. */
  const note = (source: SourceName, outcome: "clean" | "breaker" | "neutral") => {
    if (outcome === "neutral") return;
    const state = breaker(source);
    if (outcome === "clean") state.consecutive = 0;
    else if (++state.consecutive >= BREAKER_LIMIT) state.disabled = true;
  };

  async function download(source: SourceName, url: string, budget: Budget): Promise<{ accepted: NormalizeResult } | { attempt: Attempt }> {
    const response = await http.get(url, { kind: "image", budget });
    if (!response.ok) {
      note(source, response.breaker ? "breaker" : response.outcome === "budget-exhausted" ? "neutral" : "clean");
      const outcome: Outcome = response.status === 404 ? "no-cover" : response.outcome;
      return { attempt: { source, outcome, detail: response.detail } };
    }
    note(source, "clean");
    return { accepted: await normalizeCover(response.body) };
  }

  async function writeImage(slug: string, png: Buffer): Promise<boolean> {
    const target = path.join(imagesDir, `${slug}.png`);
    const temporary = `${target}.tmp`;
    try {
      await writeFile(temporary, png);
      await rename(temporary, target);
      return true;
    } catch {
      await rm(temporary, { force: true }).catch(() => undefined);
      return false;
    }
  }

  async function processBook(book: BookEntry, entry: ReportEntry): Promise<void> {
    const attempts = entry.attempts;
    let errored = false;
    let accepted: Accepted | null = null;
    let stop = false;

    const manual = await readManualFile(outDir, book.slug);
    if (manual) {
      const result = await normalizeCover(manual.bytes);
      if (result.ok) accepted = { source: "manual", sourceUrl: manual.name, rights: MANUAL_RIGHTS, result };
      else attempts.push({ source: "manual", outcome: result.reason });
    }

    const budget: Budget = { remaining: BOOK_BUDGET };
    for (const source of ONLINE_SOURCES) {
      if (accepted || stop) break;
      if (source === "google-books" && config.googleBooksApiKey === null) {
        attempts.push({ source, outcome: "skipped-no-key" });
        continue;
      }
      if (breaker(source).disabled) {
        attempts.push({ source, outcome: "source-disabled" });
        errored = true;
        continue;
      }

      const lookup: Lookup =
        source === "openlibrary"
          ? await lookupOpenLibrary(book, http, budget)
          : source === "google-books"
            ? await lookupGoogleBooks(book, config.googleBooksApiKey ?? "", http, budget)
            : await lookupCommons(book, http, budget);

      if (lookup.kind === "error") {
        note(source, lookup.breaker ? "breaker" : lookup.outcome === "budget-exhausted" ? "neutral" : "clean");
        attempts.push({ source, outcome: lookup.outcome, detail: lookup.detail });
        errored = true;
        if (lookup.outcome === "budget-exhausted") stop = true;
        continue;
      }
      note(source, "clean");
      if (lookup.kind === "none") {
        attempts.push({ source, outcome: lookup.outcome });
        continue;
      }

      for (const candidate of lookup.candidates) {
        if (breaker(source).disabled) {
          attempts.push({ source, outcome: "source-disabled" });
          errored = true;
          break;
        }
        const downloaded = await download(source, candidate.url, budget);
        if ("attempt" in downloaded) {
          attempts.push(downloaded.attempt);
          if (downloaded.attempt.outcome !== "no-cover" && downloaded.attempt.outcome !== "not-an-image") errored = true;
          if (downloaded.attempt.outcome === "budget-exhausted") {
            stop = true;
            break;
          }
          continue;
        }
        if (!downloaded.accepted.ok) {
          attempts.push({ source, outcome: downloaded.accepted.reason });
          continue;
        }
        accepted = { source, sourceUrl: candidate.url, rights: candidate.rights, result: downloaded.accepted };
        break;
      }
    }

    if (accepted && (await writeImage(book.slug, accepted.result.png))) {
      attempts.push({ source: accepted.source, outcome: "used" });
      Object.assign(entry, {
        status: "ok",
        file: imageFile(book.slug),
        source: accepted.source,
        sourceUrl: accepted.sourceUrl,
        rights: accepted.rights,
        originalSize: accepted.result.originalSize,
        outputSize: accepted.result.outputSize,
        cropped: accepted.result.cropped,
      } satisfies Partial<ReportEntry>);
      return;
    }
    if (accepted) {
      attempts.push({ source: accepted.source, outcome: "http-error", detail: "could not write the image file" });
      errored = true;
    }
    entry.status = errored ? "failed" : "missing";
  }

  const entries: ReportEntry[] = [];
  let interrupted = false;
  for (const [index, book] of selected.entries()) {
    if (signal?.aborted) {
      interrupted = true;
      break;
    }
    let entry = emptyEntry(book);
    const existing = path.join(outDir, imageFile(book.slug));
    if (!options.force && (await isValidExisting(existing))) {
      const known = previous?.books.find((candidate) => candidate.slug === book.slug);
      entry = {
        ...entry,
        status: "skipped",
        file: imageFile(book.slug),
        source: known?.source ?? null,
        sourceUrl: known?.sourceUrl ?? null,
        rights: known?.rights ?? null,
        originalSize: known?.originalSize ?? null,
        outputSize: known?.outputSize ?? null,
        cropped: known?.cropped ?? null,
      };
    } else {
      try {
        await processBook(book, entry);
      } catch {
        entry.status = "failed";
        entry.file = null;
        entry.attempts.push({ source: entry.attempts.at(-1)?.source ?? "openlibrary", outcome: "http-error", detail: "unexpected error" });
      }
    }
    entries.push(entry);
    console.log(
      `[${index + 1}/${selected.length}] ${book.slug}  ${entry.status}${entry.source ? `  ${entry.source}` : ""}${entry.outputSize ? `  ${sizeText(entry.outputSize)}` : ""}`,
    );
  }

  const report: Report = { version: 1, generatedAt: new Date().toISOString(), interrupted, books: entries };
  await writeReport(outDir, report);

  const count = (status: ReportEntry["status"]) => entries.filter((entry) => entry.status === status).length;
  console.log(`done: ${count("ok")} ok, ${count("skipped")} skipped, ${count("missing")} missing, ${count("failed")} failed${interrupted ? " (interrupted)" : ""}`);

  if (interrupted) return { exitCode: 130 };
  return { exitCode: count("missing") + count("failed") > 0 ? 1 : 0 };
}
