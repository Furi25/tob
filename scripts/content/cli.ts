// Command line entry: `npm run content -- <command>` (docs/specs/book-content-tool.md).
//   status [--list]                        where each book stands, or the list the cover tool reads
//   brief [<slug>...] [--all] [--stdout]   write the prompt that asks an assistant to draft a book
//   check [<slug>...] [--verify-sources] [--approved]
//                                          check drafts (or the approved file) and write a report
//   approve <slug>... [--accept-warnings] [--skip-verification] [--replace]
//                                          copy checked drafts into the approved file
// Exit codes: 0 fine, 1 a check failed or an approval was refused, 2 the command or its input is wrong.
// Paths are relative to the current directory. The contact address in CONTENT_CONTACT is never printed or written.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { decideApproval, mergeBooks, sha256Hex, type ApproveFlags } from "./approve";
import { deriveStatus, listLine, parseBacklog, STATUS_ORDER, type BacklogBook, type BookStatus } from "./backlog";
import { findNotes, renderPrompt } from "./brief";
import { checkApprovedEntry, checkDraft, parseDraftText, type Issue } from "./check";
import { CONTACT_LIMIT } from "./limits";
import { systemResolve } from "./net";
import { buildReport, parseReport, type ReportEntry } from "./report";
import { ContentFileSchema, DraftSchema, isValidSlug, LooseContentFileSchema, type ApprovedBook } from "./schema";
import { verifyDrafts, type VerifiedDraft } from "./verify";

const DEFAULT_BACKLOG = "docs/book-backlog.json";
const REFERENCE_FILE = "docs/books.json";
const CONTENT_DIR = ".content";
const PROMPTS_DIR = path.join(CONTENT_DIR, "prompts");
const DRAFTS_DIR = path.join(CONTENT_DIR, "drafts");
const REPORT_FILE = path.join(CONTENT_DIR, "report.json");
const OUTPUT_FILE = path.join(CONTENT_DIR, "books-content.json");

const USAGE = [
  "usage: npm run content -- <command> [--backlog <file>]",
  "  status [--list]",
  "  brief [<slug>...] [--all] [--stdout]",
  "  check [<slug>...] [--verify-sources] [--approved]",
  "  approve <slug>... [--accept-warnings] [--skip-verification] [--replace]",
].join("\n");

const OPTIONS = {
  backlog: { type: "string" },
  list: { type: "boolean" },
  all: { type: "boolean" },
  stdout: { type: "boolean" },
  "verify-sources": { type: "boolean" },
  approved: { type: "boolean" },
  "accept-warnings": { type: "boolean" },
  "skip-verification": { type: "boolean" },
  replace: { type: "boolean" },
} as const;

const ALLOWED: Record<string, readonly string[]> = {
  status: ["backlog", "list"],
  brief: ["backlog", "all", "stdout"],
  check: ["backlog", "verify-sources", "approved"],
  approve: ["backlog", "accept-warnings", "skip-verification", "replace"],
};

/** The command or its input is wrong: reported on stderr, exit code 2. */
class UsageError extends Error {}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new UsageError(`cannot read ${file}`);
  }
}

async function writeAtomic(file: string, data: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, data, "utf8");
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function loadBacklog(file: string): Promise<BacklogBook[]> {
  const text = await readOptional(file);
  if (text === null) throw new UsageError(`cannot read the backlog ${file}`);
  const result = parseBacklog(text);
  if (!result.ok) throw new UsageError(`the backlog ${file} is not valid:\n${result.errors.map((error) => `  ${error}`).join("\n")}`);
  return result.books;
}

/** The slugs in the approved file, read leniently: a damaged file only means fewer books count as approved. */
async function approvedSlugs(): Promise<Set<string>> {
  const slugs = new Set<string>();
  let text: string | null;
  try {
    text = await readOptional(OUTPUT_FILE);
  } catch {
    return slugs;
  }
  if (text === null) return slugs;
  try {
    const json: unknown = JSON.parse(text);
    const books = typeof json === "object" && json !== null ? (json as { books?: unknown }).books : undefined;
    if (Array.isArray(books)) {
      for (const book of books) {
        const slug = typeof book === "object" && book !== null ? (book as { slug?: unknown }).slug : undefined;
        if (typeof slug === "string") slugs.add(slug);
      }
    }
  } catch {
    // Not JSON: nothing counts as approved.
  }
  return slugs;
}

function requireKnownSlugs(slugs: string[], books: BacklogBook[]): BacklogBook[] {
  const known = new Map(books.map((book) => [book.slug, book]));
  const unknown = slugs.filter((slug) => !known.has(slug));
  if (unknown.length > 0) throw new UsageError(`not in the backlog: ${unknown.join(", ")}`);
  return slugs.map((slug) => known.get(slug) as BacklogBook);
}

function printIssues(issues: Issue[], kind: "error" | "warning"): void {
  for (const issue of issues) console.log(`    ${kind}  ${issue.field}: ${issue.message}`);
}

function summaryLabel(errors: Issue[], warnings: Issue[]): string {
  if (errors.length > 0) return `${plural(errors.length, "error")}, ${plural(warnings.length, "warning")}`;
  return warnings.length === 0 ? "ok" : `ok (${plural(warnings.length, "warning")})`;
}

// --- status -----------------------------------------------------------------------------------------------------

async function runStatus(books: BacklogBook[], list: boolean): Promise<number> {
  if (list) {
    for (const book of books) console.log(listLine(book));
    return 0;
  }
  const approved = await approvedSlugs();
  const counts = new Map<BookStatus, number>(STATUS_ORDER.map((status) => [status, 0]));
  const width = Math.max(0, ...books.map((book) => book.slug.length));
  for (const book of books) {
    const status = deriveStatus({
      prompt: existsSync(path.join(PROMPTS_DIR, `${book.slug}.md`)),
      draft: existsSync(path.join(DRAFTS_DIR, `${book.slug}.json`)),
      approved: approved.has(book.slug),
    });
    counts.set(status, (counts.get(status) ?? 0) + 1);
    console.log(`${book.slug.padEnd(width)}  ${status.padEnd(8)}  ${book.title} by ${book.author}`);
  }
  console.log("");
  console.log(`Total ${books.length}: ${STATUS_ORDER.map((status) => `${status} ${counts.get(status)}`).join(", ")}`);
  return 0;
}

// --- brief ------------------------------------------------------------------------------------------------------

async function runBrief(books: BacklogBook[], slugs: string[], all: boolean, toStdout: boolean): Promise<number> {
  let selected: BacklogBook[];
  if (slugs.length > 0) {
    selected = requireKnownSlugs([...new Set(slugs)], books);
  } else if (all) {
    selected = books;
  } else {
    const approved = await approvedSlugs();
    selected = books.filter((book) => !approved.has(book.slug));
  }
  if (toStdout && selected.length !== 1) {
    throw new UsageError(`--stdout needs exactly one book, and ${selected.length} were selected; name one slug`);
  }

  let reference: unknown = null;
  const referenceText = await readOptional(REFERENCE_FILE);
  if (referenceText !== null) {
    try {
      reference = JSON.parse(referenceText);
    } catch {
      reference = null;
    }
  }

  const prompts = selected.map((book) => ({ book, text: renderPrompt(book, findNotes(reference, book)) }));
  if (toStdout) {
    process.stdout.write(prompts[0].text);
    return 0;
  }
  if (prompts.length === 0) {
    console.log("nothing to brief: every book is approved (use --all to brief them again)");
    return 0;
  }
  for (const { book, text } of prompts) {
    const file = path.join(PROMPTS_DIR, `${book.slug}.md`);
    await writeAtomic(file, text);
    console.log(`wrote ${file.split(path.sep).join("/")}`);
  }
  return 0;
}

// --- check ------------------------------------------------------------------------------------------------------

function readContact(): string {
  const contact = process.env.CONTENT_CONTACT;
  if (
    contact === undefined ||
    Array.from(contact).length < CONTACT_LIMIT.min ||
    Array.from(contact).length > CONTACT_LIMIT.max ||
    /[\u0000-\u001f\u007f-\u009f]/.test(contact)
  ) {
    throw new UsageError(
      `--verify-sources needs CONTENT_CONTACT: an email address or web address of ${CONTACT_LIMIT.min} to ${CONTACT_LIMIT.max} characters, set in the environment or in .env`,
    );
  }
  return contact;
}

async function draftSlugs(requested: string[]): Promise<string[]> {
  if (requested.length > 0) {
    const unique = [...new Set(requested)];
    const missing = unique.filter((slug) => !existsSync(path.join(DRAFTS_DIR, `${slug}.json`)));
    if (missing.length > 0) throw new UsageError(`no draft file for: ${missing.join(", ")}`);
    return unique;
  }
  let names: string[];
  try {
    names = await readdir(DRAFTS_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new UsageError(`cannot read ${DRAFTS_DIR}`);
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

async function runCheckDrafts(books: BacklogBook[], requested: string[], verifySources: boolean): Promise<number> {
  const bySlug = new Map(books.map((book) => [book.slug, book]));
  requireKnownSlugs(requested, books);
  const contact = verifySources ? readContact() : null;
  const slugs = await draftSlugs(requested);
  if (slugs.length === 0) {
    console.log("no drafts to check");
    return 0;
  }

  const entries: ReportEntry[] = [];
  const toVerify: { slug: string; facts: { claim: string; sourceUrl: string; evidence: string }[] }[] = [];
  for (const slug of slugs) {
    const bytes = await readFile(path.join(DRAFTS_DIR, `${slug}.json`));
    const parsed = parseDraftText(bytes.toString("utf8"));
    const book = bySlug.get(slug);
    let errors: Issue[];
    let warnings: Issue[] = [];
    if (!parsed.ok) {
      errors = [parsed.issue];
    } else if (book === undefined) {
      errors = [{ field: "slug", rule: "not-in-backlog", message: "this draft's file name is not a book in the backlog" }];
    } else {
      ({ errors, warnings } = checkDraft(parsed.value, { slug, entry: book }));
    }
    entries.push({ slug, draftSha256: sha256Hex(bytes), errors, warnings, verification: null });
    if (parsed.ok && book !== undefined) {
      const draft = DraftSchema.safeParse(parsed.value);
      if (draft.success) toVerify.push({ slug, facts: draft.data.facts });
    }
  }

  if (contact !== null) {
    const verified: VerifiedDraft[] = await verifyDrafts({
      drafts: toVerify,
      contact,
      deps: {
        fetch: (input, init) => globalThis.fetch(input, init),
        resolve: systemResolve,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
      },
    });
    for (const result of verified) {
      const entry = entries.find((item) => item.slug === result.slug);
      if (entry === undefined) continue;
      entry.verification = { facts: result.facts };
      result.facts.forEach((fact, index) => {
        if (fact.result !== "verified") {
          entry.warnings.push({
            field: `facts.${index}`,
            rule: "verification",
            message: `${fact.result}: ${fact.sourceUrl}`,
          });
        }
      });
    }
  }

  await writeAtomic(REPORT_FILE, `${JSON.stringify(buildReport(new Date(), entries), null, 2)}\n`);
  for (const entry of entries) {
    console.log(`${entry.slug}  ${summaryLabel(entry.errors, entry.warnings)}`);
    printIssues(entry.errors, "error");
    printIssues(entry.warnings, "warning");
  }
  return entries.some((entry) => entry.errors.length > 0) ? 1 : 0;
}

async function runCheckApproved(books: BacklogBook[], requested: string[]): Promise<number> {
  const bySlug = new Map(books.map((book) => [book.slug, book]));
  requireKnownSlugs(requested, books);
  const text = await readOptional(OUTPUT_FILE);
  if (text === null) throw new UsageError(`there is no approved file (${OUTPUT_FILE}) to check`);

  let file: ReturnType<typeof LooseContentFileSchema.safeParse>;
  try {
    file = LooseContentFileSchema.safeParse(JSON.parse(text));
  } catch {
    console.log(`${OUTPUT_FILE}  not valid JSON`);
    return 1;
  }
  if (!file.success) {
    console.log(`${OUTPUT_FILE}  not an approved file`);
    for (const issue of file.error.issues) console.log(`    error  ${issue.path.join(".") || "(file)"}: ${issue.message}`);
    return 1;
  }

  let failed = false;
  file.data.books.forEach((entry, index) => {
    const slug = typeof entry === "object" && entry !== null && typeof (entry as { slug?: unknown }).slug === "string" ? (entry as { slug: string }).slug : `entry ${index}`;
    if (requested.length > 0 && !requested.includes(slug)) return;
    const book = bySlug.get(slug);
    const { errors, warnings } =
      book === undefined
        ? { errors: [{ field: "slug", rule: "not-in-backlog", message: "this book is not in the backlog" }], warnings: [] }
        : checkApprovedEntry(entry, { slug, entry: book });
    if (errors.length > 0) failed = true;
    console.log(`${slug}  ${summaryLabel(errors, warnings)}`);
    printIssues(errors, "error");
    printIssues(warnings, "warning");
  });
  return failed ? 1 : 0;
}

// --- approve ----------------------------------------------------------------------------------------------------

async function runApprove(books: BacklogBook[], requested: string[], flags: ApproveFlags): Promise<number> {
  if (requested.length === 0) throw new UsageError(`approve needs at least one slug\n${USAGE}`);
  const slugs = [...new Set(requested)];
  const selected = requireKnownSlugs(slugs, books);

  let existing: ApprovedBook[] = [];
  const outputText = await readOptional(OUTPUT_FILE);
  if (outputText !== null) {
    let json: unknown;
    try {
      json = JSON.parse(outputText);
    } catch {
      throw new UsageError(`${OUTPUT_FILE} is not valid JSON; fix or remove it first`);
    }
    const parsed = ContentFileSchema.safeParse(json);
    if (!parsed.success) throw new UsageError(`${OUTPUT_FILE} is not a valid approved file; fix or remove it first`);
    existing = parsed.data.books;
  }
  const alreadyApproved = new Set(existing.map((book) => book.slug));
  const report = parseReport(await readOptional(REPORT_FILE));

  const now = new Date();
  const approved: ApprovedBook[] = [];
  let refused = false;
  for (const book of selected) {
    let draftBytes: Buffer | null = null;
    try {
      draftBytes = await readFile(path.join(DRAFTS_DIR, `${book.slug}.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new UsageError(`cannot read the draft of ${book.slug}`);
    }
    const decision = decideApproval(
      { slug: book.slug, entry: book, draftBytes, report, alreadyApproved: alreadyApproved.has(book.slug) },
      flags,
      now,
    );
    if (decision.ok) {
      approved.push(decision.book);
      console.log(`${book.slug}  approved`);
    } else {
      refused = true;
      console.error(`${book.slug}  refused`);
      for (const reason of decision.reasons) console.error(`    ${reason}`);
    }
  }

  if (approved.length > 0) {
    const file = { version: 1, generated: now.toISOString(), books: mergeBooks(existing, approved) };
    await writeAtomic(OUTPUT_FILE, `${JSON.stringify(file, null, 2)}\n`);
  }
  return refused ? 1 : 0;
}

// --- main -------------------------------------------------------------------------------------------------------

async function main(): Promise<number> {
  let values: Record<string, string | boolean | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: OPTIONS }));
  } catch (error) {
    throw new UsageError(`${error instanceof Error ? error.message : "bad arguments"}\n${USAGE}`);
  }

  const [command, ...slugs] = positionals;
  const allowed = command === undefined ? undefined : ALLOWED[command];
  if (allowed === undefined) throw new UsageError(command === undefined ? USAGE : `unknown command "${command}"\n${USAGE}`);
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && !allowed.includes(name)) throw new UsageError(`--${name} does not apply to ${command}\n${USAGE}`);
  }
  if (command === "status" && slugs.length > 0) throw new UsageError(`status takes no slug\n${USAGE}`);
  const badSlug = slugs.find((slug) => !isValidSlug(slug));
  if (badSlug !== undefined) throw new UsageError(`not a valid slug: "${badSlug.slice(0, 120)}" (lower-case letters, digits and single dashes)`);
  if (command === "check" && values.approved === true && values["verify-sources"] === true) {
    throw new UsageError("--approved checks the approved file offline and cannot be combined with --verify-sources");
  }

  if (existsSync(".env")) {
    try {
      process.loadEnvFile(".env");
    } catch {
      throw new UsageError("cannot read the .env file");
    }
  }

  const backlogFile = typeof values.backlog === "string" ? values.backlog : DEFAULT_BACKLOG;
  const books = await loadBacklog(backlogFile);

  switch (command) {
    case "status":
      return runStatus(books, values.list === true);
    case "brief":
      return runBrief(books, slugs, values.all === true, values.stdout === true);
    case "check":
      return values.approved === true ? runCheckApproved(books, slugs) : runCheckDrafts(books, slugs, values["verify-sources"] === true);
    default:
      return runApprove(books, slugs, {
        acceptWarnings: values["accept-warnings"] === true,
        skipVerification: values["skip-verification"] === true,
        replace: values.replace === true,
      });
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof UsageError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error("the tool stopped because of an unexpected error");
    process.exitCode = 1;
  },
);
