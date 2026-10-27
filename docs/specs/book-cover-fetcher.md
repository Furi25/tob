# Book Cover Fetcher

## Goal

A developer runs one command with a text file of books and gets a folder of cover images, one per book. The images are named after the book, cut to the 2:3 book-cover shape and saved as PNG, so the folder can be dropped straight into an outside tool (Gemini, for the pixel-art versions). It is developer tooling, not an app feature. It is a script in `scripts/`, the app never calls it, and nothing it produces is kept in the repo. The images are working files: use them, then throw them away.

Where the images come from decides the legal and technical limits, so the sources, their terms and the request limits are part of this spec (see *API Contracts → External sources*).

### Requirements map

| Your point | Where |
|---|---|
| 1. Sources, licence and terms of use | *API Contracts → External sources*, *Risks* |
| 2. Output format and location, how it reaches the app | *Data Model → Output*. It does not reach the app (see *Scope*). |
| 3. Re-runnable, committed or regenerated | *Data Model → Re-runs*. Idempotent, never committed. |
| 4. Where the code lives, invocation, config and secrets | *API Contracts → Command line*, *Configuration*, *Code layout* |
| 5. Failure handling | *API Contracts → Failure handling* |
| 6. Acceptance criteria for Vitest | *Acceptance Criteria* |

## Scope

**In scope**

- A command `npm run covers:fetch -- <list-file>` that reads a plain-text list of books and writes one image per book.
- **At most 100 books per run** (decided 2026-10-26). A longer list is refused before any request is made.
- Output that is ready to hand to another tool: file named after the book, exactly 2:3, PNG, between 250×375 and 800×1200 pixels, with no stretching and no enlarging.
- Sources, tried in this order for each book: a file the developer put there by hand, Open Library, Google Books (only when an API key is configured), Wikimedia Commons.
- Picking an edition by an optional ISBN in the list, otherwise the cover Open Library shows for the work.
- A report next to the images that says, for every book, what happened, where the image came from and what the rights note is.
- Safe re-runs: books that already have a valid image are skipped.
- Polite use of the remote services: an identifying `User-Agent`, a delay between requests, bounded retries and a request limit per book.
- Tests that run without a network and without a database.

**Out of scope**

- **Anything in the app.** No change to `src/app`, `src/components`, the Prisma schema, the seed's data, `public/` or `coverImage`. The images are not served, stored in the database or committed. If the app should show covers someday, that is a new spec (see [book-detail-page.md](book-detail-page.md), which defines `/covers/<slug>.<ext>` for that case).
- The pixel-art step. It happens outside this project.
- Reading the list from the database or from `docs/books.json`. The list is a file the developer writes.
- Goodreads, Amazon and other retailer or publisher sites. See *External sources*.
- Choosing the *original* (first-edition) cover. A `--prefer original` mode was considered and not built. Use the ISBN column to pick a specific edition.
- A contact-sheet page, a manifest that is committed, locking a chosen cover, and a cache of downloaded images apart from the output folder.
- Author photos, back covers, spines and any other image type.
- Running in CI or as part of `npm run build`, `npm run test` against the real internet, or any schedule.
- Checking that the images may be used downstream. The tool records where each image came from. The decision is the developer's (see *Risks*).

## Data Model

**No database change and no Prisma migration.** The tool reads and writes files only.

### Input — the list file

A UTF-8 text file passed on the command line. One book per line:

```
# comments start with #, blank lines are ignored
Title | Author | ISBN
The Hobbit | J.R.R. Tolkien
Good Omens | Neil Gaiman & Terry Pratchett | 978-0-06-085398-3
```

| Field | Rule |
|---|---|
| Title | Required, 1–200 characters after trimming. |
| Author | Required, 1–200 characters after trimming. Several authors in one field are fine (`&`, `and`, `,`). |
| ISBN | Optional. ISBN-10 or ISBN-13, hyphens and spaces allowed. Stored as digits only (a trailing `X` is allowed on ISBN-10). The check digit must be valid. |

- Exactly 2 or 3 fields separated by `|`. A `|` can't appear inside a field.
- A leading byte-order mark and Windows line endings are accepted.
- **Slug** = the title run through the shared `slugify` (see *Code layout*): accents removed, lower case, runs of other characters become one `-`, no leading or trailing `-`. `The Hobbit` becomes `the-hobbit`, `Fahrenheit 451` becomes `fahrenheit-451`.
- Two lines with the same slug, an empty slug, a bad ISBN, a missing field or more than 100 books are errors. The tool reports every error with its line number and stops before any request (exit code 2).

```ts
// Illustrative — scripts/covers/list.ts
type BookEntry = { line: number; slug: string; title: string; author: string; isbn: string | null };
```

### Output

All output goes under one folder, `--out`, default `.covers/` in the repo root. The default is added to `.gitignore`.

```
.covers/
  images/<slug>.png      ← the folder you give to the other tool: only PNG files, nothing else
  manual/<slug>.<ext>    ← optional: covers you downloaded yourself (png, jpg, jpeg, webp)
  report.json            ← what happened, per book
```

**Image rules** (every source, and `manual/` too, goes through the same step):

| Rule | Value |
|---|---|
| File name | `<slug>.png`, in `images/` |
| Format | PNG, sRGB, no alpha (transparency is flattened onto white), no metadata, EXIF orientation applied first |
| Shape | Exactly 2:3 (width:height). The output is `2k × 3k` pixels. |
| How a source image becomes 2:3 | If its width/height ratio is within ±8% of 2/3 (0.6133 to 0.7200), it is cropped around the centre to the largest 2:3 box, so at most about 4% is trimmed from each side of one axis. The picture is never stretched or padded. |
| Too far from 2:3 | Rejected (`bad-ratio`): wide box-set pictures, squares and similar. The next candidate is tried. |
| Smallest | Output at least 250×375. A smaller result is rejected (`too-small`). |
| Largest | Output at most 800×1200. Bigger sources are scaled down (Lanczos). |
| Enlarging | Never. |
| Same input, same bytes | The conversion is deterministic. |

With `w×h` as the source size, the cropped box is `2k × 3k` where `k = floor(min(w/2, h/3))`. If `k > 400`, the result is then scaled to 800×1200. This keeps the ratio exact with whole pixels.

### Report

`report.json` is rewritten at the end of every run. It is validated with Zod when written and when read back.

```ts
// Illustrative
type Attempt = {
  source: "manual" | "openlibrary" | "google-books" | "wikimedia-commons";
  outcome:
    | "used" | "no-match" | "no-cover" | "bad-ratio" | "too-small" | "not-an-image"
    | "http-error" | "rate-limited" | "skipped-no-key" | "source-disabled" | "budget-exhausted";
  detail?: string;                 // short, never contains a key or the contact address
};
type ReportEntry = {
  slug: string; title: string; author: string; isbn: string | null;
  status: "ok" | "skipped" | "missing" | "failed";
  file: string | null;             // "images/the-hobbit.png"
  source: Attempt["source"] | null;
  sourceUrl: string | null;        // the image URL (or the manual file name); no query-string secrets
  rights: string | null;           // e.g. "Cover art; copyright usually held by the publisher. Not licensed by this source."
  originalSize: { width: number; height: number } | null;
  outputSize: { width: number; height: number } | null;
  cropped: boolean | null;
  attempts: Attempt[];             // in the order tried
};
type Report = { version: 1; generatedAt: string; interrupted: boolean; books: ReportEntry[] };
```

- One entry per **processed** book, in list order. A normal run processes every line, so that is one entry per list line. With `--only <slug>` the report holds just that book, and after a stop (exit code 130) it holds the books handled so far. The report is rewritten, not merged: books not processed in this run are not carried over from the previous report.
- `status`: `ok` = a new image was written. `skipped` = a valid image already existed and was left alone (its `source`, `sourceUrl`, `rights`, sizes and `cropped` are copied from the previous report when the book is in it, otherwise `null`). `missing` = every source cleanly had nothing usable. `failed` = at least one source errored and none produced an image.
- **What counts as an error** (for `failed`): an `http-error`, `rate-limited`, `source-disabled` or `budget-exhausted` attempt, a response of an unexpected shape, and a failure to write the image file. **Not errors**: `no-match`, `no-cover`, `bad-ratio`, `too-small`, `not-an-image`, `skipped-no-key`. A book that was `source-disabled` is therefore `failed`, not `missing`: the source never got to answer.
- A failure to write the image file is recorded as an `http-error` attempt for the source that supplied the image, with a short `detail`.
- The report is **not** in `images/`, so that folder holds nothing but the images.
- It holds no API key and no contact address.

### Re-runs

- **Idempotent.** A book whose `images/<slug>.png` exists, decodes as a PNG, is exactly 2:3 and is at least 250 px wide is `skipped` with no request made. Anything else (missing, corrupt, wrong shape) is fetched again.
- `--force` fetches every selected book again and replaces its file.
- **Never committed.** `.covers/` is in `.gitignore`. The tool refuses an `--out` that is inside `src/` or `public/` (so publisher covers can't end up served by the app by accident).
- Writes are atomic: an image is written to `images/<slug>.png.tmp` and renamed into place. Stray `*.tmp` files from an earlier crash are deleted at the start of the next run.

## API Contracts

There are no Server Actions or route handlers. The contract is the command line, the configuration and the remote services.

### Command line

```
npm run covers:fetch -- <list-file> [--out <dir>] [--force] [--only <slug>]
```

| Part | Meaning |
|---|---|
| `<list-file>` | Required. The file described above. |
| `--out <dir>` | Output folder. Default `.covers`. |
| `--force` | Fetch again even when a valid image exists. |
| `--only <slug>` | Process just that book from the list. An unknown slug is an error. |

Arguments are parsed with Node's built-in `util.parseArgs` in strict mode. An unknown flag, a missing list file or more than one positional argument is an error.

**Exit codes**

| Code | Meaning |
|---|---|
| 0 | Every book is `ok` or `skipped`. |
| 1 | At least one book is `missing` or `failed`. The report says which and why. |
| 2 | Nothing was attempted: bad list, bad flag, missing or invalid configuration, forbidden or unwritable `--out`. No request was made. |
| 130 | Stopped with Ctrl+C. The stop is checked **between books**: the book in progress is finished (it is bounded by the request budget), no new book is started, the report is written with `interrupted: true`, and no `.tmp` file is left behind. A second Ctrl+C leaves at once. An already-fired signal at the start means zero requests and an empty report. |

The console shows one line per book (`[12/60] the-hobbit  ok  openlibrary  800x1200`) and a final summary of how many books are `ok`, `skipped`, `missing` and `failed`.

### Configuration

Read from environment variables. If a `.env` file exists in the repo root it is loaded with Node's built-in `process.loadEnvFile()`, which never overrides variables that are already set. No new package is needed.

| Variable | Required | Use |
|---|---|---|
| `COVERS_CONTACT` | Yes | An email address or an `https:` URL. Sent in the `User-Agent` (`tree-of-books-covers/1.0 (<contact>)`), as Open Library and Wikimedia ask. Missing or invalid is exit code 2. |
| `GOOGLE_BOOKS_API_KEY` | No | Without it the Google Books source is skipped (`skipped-no-key`). With it, it is sent only to `www.googleapis.com`. |

- `.env` is already ignored by git. Both names are added to `.env.example` with empty values.
- **Secrets handling.** The key never appears in the report, in the console, in error messages or in any URL written down. The contact address is sent to the services and appears nowhere else.
- These variables are read only inside `scripts/covers/`. They are not part of the app's environment handling.

### Code layout

```
scripts/covers/
  cli.ts              entry point: flags, config, exit codes (thin)
  config.ts           environment + flags → validated Config (Zod)
  list.ts             parseBookList(text) → BookEntry[] or errors
  image.ts            normalizeCover(buffer) → { png, originalSize, outputSize, cropped } or a rejection reason
  http.ts             the request policy (below); takes fetch, sleep and a clock so tests need no network
  match.ts            title and author matching
  run.ts              one run: per-book loop, source order, budget, circuit breaker, files, report
  report.ts           Report schema, read, write
  sources/manual.ts
  sources/openlibrary.ts
  sources/google-books.ts
  sources/commons.ts
  sources/types.ts    shared source types (extra files like this one are allowed)
  *.test.ts           next to the code, as the project convention says
```

**Module contracts** (pinned here because the tests depend on them; they were only sketched before):

```ts
// Illustrative
slugify(title: string): string                                            // src/lib/slug.ts
parseBookList(text: string): { ok: true; books: BookEntry[] } | { ok: false; errors: { line: number; message: string }[] }
loadConfig(env: Record<string, string | undefined>):
  { ok: true; config: { contact: string; googleBooksApiKey: string | null } } | { ok: false; errors: string[] }
normalizeCover(input: Buffer): Promise<                                  // never throws
  { ok: true; png: Buffer; originalSize: Size; outputSize: Size; cropped: boolean } |
  { ok: false; reason: "bad-ratio" | "too-small" | "not-an-image" }>
createHttp({ contact, fetch?, sleep?, now? }).get(url, { kind: "json" | "image" }):   // never throws
  Promise<{ ok: true; status: number; contentType: string | null; body: Buffer } | { ok: false; outcome: string; status?: number; detail?: string }>
titleMatches(listTitle: string, candidateTitle: string): boolean
authorMatches(listAuthor: string, candidateAuthors: readonly string[]): boolean
runCovers({ listText, outDir, force?, only?, config, deps?: { fetch, sleep, now, signal? } }): Promise<{ exitCode: number }>
```

- An empty list is reported as an error with line `0`, as is a list over 100 books (they belong to no single line). A line with several problems reports only its first one.
- `originalSize` is the size as displayed (after the EXIF rotation), not as stored.

- `scripts/covers/**` is TypeScript run through `tsx` (already a dev dependency). The existing scripts are `.mjs`, but this tool has JSON from three remote services to validate, so strict types and Zod are worth it.
- `package.json` gets `"covers:fetch": "tsx scripts/covers/cli.ts"`.
- **No new dependencies.** It uses `sharp` and `tsx` (already in `devDependencies`), `zod` (already installed) and Node's built-ins (`fetch`, `util.parseArgs`, `process.loadEnvFile`).
- **Shared slug function (small refactor).** `slugify` currently lives, unexported, in `prisma/seed.ts`. It moves to `src/lib/slug.ts` (a pure function, with no `server-only` import) and `prisma/seed.ts` imports it. Behaviour is unchanged, so every seeded slug stays the same. The tool imports it from there. This is the only file outside `scripts/` and config that changes, and nothing in `src/app` or `src/components` imports it or the tool.
- **Tests** need a new Vitest project in `vitest.config.ts`, for example `tools` with `include: ["scripts/**/*.test.ts"]`, no `globalSetup` and no database. The existing `unit` project only includes `src/**`. `npm run test` then runs them. The project is shared by every tool under `scripts/`, so another tool's red tests show up in it too; run this tool's tests alone with `npx vitest run scripts/covers`.
- **`.env.example`** is edited by a person: the AI tooling in this repo is not allowed to change that file, so the implementer asks for the two lines instead.

### Request policy (`http.ts`)

Every request, from every source, goes through one function that enforces all of this:

| Rule | Value |
|---|---|
| `User-Agent` | `tree-of-books-covers/1.0 (<COVERS_CONTACT>)` on every request |
| Spacing | At least 1000 ms between two requests to the same host. Different hosts don't wait for each other. |
| Timeout | 20 s per request |
| Retries | On HTTP 429, 502, 503, 504 and on network errors or timeouts: up to 3 retries, waiting 2 s, 4 s, 8 s. A `Retry-After` header (seconds or a date) replaces the wait if it is longer. If it asks for more than 60 s, no retry is made and the attempt is `rate-limited`. |
| Not retried | 404 (`no-match` / `no-cover`), 403, every other 4xx, and 500 or any other 5xx not listed above (`http-error`, with the status). A 403 counts as a rate limit (`rate-limited`) for the circuit breaker below. A 404, 500 or bad-shape reply does **not** count toward the breaker and resets its count. |
| Failure details | Short and generic (`network error`, `the request timed out`, `HTTP 500`, `refused: host … is not on the allowed list`). They never contain a URL with a query string, the key, the contact address or the text of a thrown error. |
| Redirects | Followed by hand, at most 5. Every hop is checked like a first request. A hop does not count against the budget. |
| Allowed URLs | `https:` only, and only these hosts: `openlibrary.org`, `covers.openlibrary.org`, `archive.org`, `*.archive.org`, `www.googleapis.com`, `books.google.com`, `*.googleusercontent.com`, `commons.wikimedia.org`, `upload.wikimedia.org`. Anything else (`http:`, other hosts, IP addresses, `localhost`, URLs with credentials, other schemes) is refused without a request. This holds for URLs the services return, not only the ones we build. Adding a host needs a spec update. |
| Image responses | `Content-Type` must start with `image/`. At most 15 MB (checked from the header and again while reading). |
| Request budget | At most 12 requests per book across all sources, retries included (each network attempt counts once; following a redirect does not). Past that, the book stops with `budget-exhausted` (status `failed`); sources not yet tried are not tried. |
| Circuit breaker | Per source (its search and its image host together). If it runs out of retries (or gets a 403) twice **in a row**, it is switched off for the rest of the run. Any other answer, including a 404, resets the count. Later books record `source-disabled` for it and move on, and a source switched off in the middle of a book stops offering that book's remaining candidates. |
| Order | Sequential. One request at a time. |

### Failure handling

```mermaid
flowchart TD
  A[Book from the list] --> B{Valid image already in images/?}
  B -- yes, no --force --> S[status skipped]
  B -- no --> C[Sources in order: manual, Open Library, Google Books, Commons]
  C --> D{Candidate image}
  D -- passes the image rules --> W[Write images/slug.png atomically; status ok]
  D -- rejected or error --> E[Record the attempt, try the next candidate or source]
  E --> C
  E -- all sources done --> F{Any source errored?}
  F -- yes --> X[status failed]
  F -- no --> M[status missing]
```

- **One book never stops the run.** A missing or failed book is recorded and the run goes on. The exit code (1) says something was left over.
- **Missing data.** No match, no cover, a placeholder image, a picture that is not a cover shape: the attempt is recorded and the next candidate is tried. A source returns at most 3 candidates per book.
- **Rate limits.** Spacing, bounded retries, `Retry-After`, the request budget and the circuit breaker, as above. The tool never retries around a limit, never uses several addresses, and never loops forever.
- **Partial runs.** Because each image is written atomically and an existing valid image is skipped, re-running the same command finishes the job without redoing the finished books. Ctrl+C stops before the next book and still writes the report.
- **Bad responses.** Every remote JSON body is parsed with Zod. A body of an unexpected shape is `http-error` for that source and book, not a crash.
- **Wrong cover risk.** A search can match the wrong book. See the matching rule below, and use the ISBN column for stubborn cases.

### External sources

Order of use for each book: **manual file, Open Library, Google Books, Wikimedia Commons.** Terms below are from the services' own documentation (read 2026-10-26). The summary of Goodreads is from the author's earlier statement and was not re-checked in this spec.

| Source | What we call | Terms and limits that matter | Rights of the image |
|---|---|---|---|
| **Manual** (`manual/<slug>.<ext>`) | A file you put there | None. Tried first, because a file you placed is a decision. It goes through the same image rules, and a rejected file is recorded and the tool falls through to the online sources. | Whatever you have. Reported as "Supplied by the developer." |
| **Open Library** | `search.json` (title, author; or the ISBN), then the cover **by cover ID** | Search API: 1 request/second anonymous, 3/second with an identifying `User-Agent` and contact. Asks not to scrape HTML, not to make hundreds of single-book requests, and not to use it as a bulk backend. Covers API: **by cover ID or OLID there is no limit**, but by ISBN, OCLC or LCCN it is limited to 100 requests per IP per 5 minutes (a 403 after that). It says it is for showing covers on public pages and **not for bulk download or crawling**. | Open Library does not license cover art. It is normally the publisher's. |
| **Google Books** | `volumes` search with an API key, then the image link | The key is required for public data. Books API terms: no fee for users of your app, remove content on a rights holder's request. Nothing in them grants a right to keep the images. | The publisher's. |
| **Wikimedia Commons** | `api.php` search (File namespace), then image info with licence metadata | A descriptive `User-Agent` with contact is required, or the requests may be blocked. | Each file has its own licence. Only free licences are accepted (CC0, CC BY, CC BY-SA, public domain). The licence text is stored in `rights`. |
| **Excluded: Goodreads** | – | No public API (closed to new keys in 2020), and the terms forbid scraping. | – |
| **Excluded: Wikipedia infobox covers, Amazon, publisher and retailer pages** | – | Non-free uploads on one wiki, or scraping of pages. | – |

**Open Library details**

- **With an ISBN:** `GET https://openlibrary.org/isbn/<digits>.json` (it redirects to the edition) and read its `covers` list (positive IDs only). The covers-by-ISBN endpoint is never used, because of its 100-per-5-minutes limit. An edition without a cover is `no-cover`; an unknown ISBN (404) is `no-match`. The ISBN edition is not filtered by title or author.
- **Without an ISBN:** `search.json` with `title`, `author` (the first author in the list entry), `limit=5` and a restricted `fields` list that includes `key`, `title`, `author_name` and `cover_i`. The results that **match the book** (below) and have `cover_i` are the candidates, in result order, at most 3; each is downloaded in turn until one passes the image rules. Matching results with no `cover_i` give `no-cover`; no matching result gives `no-match`. Download `https://covers.openlibrary.org/b/id/<cover_i>-L.jpg?default=false` (`default=false` makes a missing cover a 404 instead of a blank picture).
- **"Most popular" is a stand-in.** `cover_i` is the cover Open Library itself shows for the work, which is the closest signal the API gives to the popular edition. It is not a measure of sales. See *Risks*.

**Matching rule** (`match.ts`, used by Open Library and Google Books)

- Normalise a string by removing diacritics, lowering the case, turning `&` into `and`, turning every other non-alphanumeric run into one space and trimming.
- **Title matches** when, after normalising and dropping a leading `the`, `a` or `an`, the candidate's title equals the list title, **or** the list title is exactly the part of the candidate's title before a **subtitle mark** (`:`, `;`, `(`, `[`, `–`, `—` or ` - `). So `Dune` matches `Dune: Deluxe Edition` and `Fahrenheit 451: A Novel`. A candidate that merely contains the title (`SparkNotes: The Hobbit`), or goes on without a subtitle mark (`The Hobbit Companion`, `Children of Dune`, `Dunes`), does not match. (The first version of this rule said "followed by a word boundary", which also matched `The Hobbit Companion` and contradicted criterion 30. The subtitle mark is the fix.)
- **Author matches** when the surname of at least one author in the list entry appears as a whole word in at least one of the candidate's authors. The list entry is split into authors at `&`, `,`, `;` and the word `and`; the surname is the last word of each part, compared after normalising. No candidate authors means no match.

**Google Books details**

- Only with `GOOGLE_BOOKS_API_KEY`. Search by ISBN (`isbn:<digits>`) when there is one, otherwise by `intitle:` and `inauthor:` (first author), `maxResults=5`. Keep volumes that match (rule above, **also when searching by ISBN**) and have an image link, at most 3 candidates. Volumes that match but have no image link give `no-cover`; none that match give `no-match`. Use the largest link offered (`extraLarge`, `large`, `medium`, `small`, `thumbnail`, `smallThumbnail`, in that order), changed to `https:`. The key is never part of a candidate URL. Remove the page-curl effect parameter (`edge=curl`) if the URL has it. Google's thumbnails for missing covers are placeholders, so the ratio and size rules are what reject them.
- The exact response shape is checked against a recorded sample (see criteria), because the API's image-link fields differ between the search and the single-volume responses.

**Wikimedia Commons details**

- One request: a search in the File namespace (`namespace=6`, `limit=5`) for `<title> <surname of the first author> cover` that also returns each file's URL, type and licence (`generator=search` with `prop=imageinfo`). Accept a file only if its name (without `File:`) contains every word of the normalised title, **including a leading `the`**, and the word `cover`, its type is JPEG, PNG or WebP, and its licence is on the free list (`CC0`, `CC BY` and `CC BY-SA` with a version number, `Public domain`, `PD-…`). The accepted files, in search order and at most 3, are the candidates. `rights` is `Wikimedia Commons file, licence: <licence text>.` This source is a last resort for old books, where a first-edition or public-domain cover may exist.

## UI Surface

There is none. No route, no component and no change to the app.

The only interface is the terminal: the progress line per book, the final summary and the exit code (see *Command line*), plus `report.json` for details.

## Acceptance Criteria

All tests run in Vitest, without a network and without Postgres. Tests give the code a fake `fetch`, a fake clock and a fake `sleep`, and make real `fetch` throw if it is ever reached. Image tests make their inputs with `sharp` (no binary fixtures). Recorded API replies live in `scripts/covers/__fixtures__/` as small JSON files. "Slug" below means the output of `slugify`.

**Where the code lives and what it may depend on**

1. `package.json` has the script `covers:fetch` and no new entry in `dependencies`. `sharp` and `tsx` are in `devDependencies`.
2. No file under `src/app` or `src/components` (or anywhere under `src/`) imports from `scripts/`, and no non-test file under `scripts/covers/` imports from `src/app` or `src/components`.
3. `.gitignore` ignores `.covers/`. `.env.example` lists `COVERS_CONTACT` and `GOOGLE_BOOKS_API_KEY` with empty values.
4. `prisma/seed.ts` imports `slugify` from `src/lib/slug.ts` and defines no slug function of its own. For a table of titles (`The Hobbit`, `Fahrenheit 451`, `Brontë`-style accents, punctuation, repeated spaces, leading and trailing symbols) `slugify` returns `the-hobbit`, `fahrenheit-451` and so on.
5. The `tools` Vitest project runs `scripts/**/*.test.ts` and needs no database.

**List parsing**

6. A valid list gives one `BookEntry` per book line with trimmed `title` and `author`, `isbn: null` when absent, the right line number and the right slug. Comment lines, blank lines, a BOM and CRLF endings are handled.
7. ISBNs: hyphens and spaces are removed, an ISBN-10 ending in `X` is accepted, and an ISBN-13 and an ISBN-10 with a valid check digit pass. A wrong check digit or length is an error that names the line.
8. These are errors, each naming its line: a missing author, an empty title, a title or author over 200 characters, a line with more than 3 fields, a title with an empty slug (for example `!!!`).
9. Two entries with the same slug give an error that names both lines.
10. An empty list (no books) is an error. 100 books is accepted. 101 is an error. In both error cases no request is made.

**Image rules**

11. For sources with a ratio of 0.62, 0.65, 0.667, 0.70 and 0.72, the output has width `2k` and height `3k` (exact 2:3), is a PNG that decodes, and was cropped around the centre without stretching (a probe image with coloured corners shows the crop is centred).
12. Ratios just inside the tolerance (0.615 and 0.719) are accepted and ratios just outside (0.612 and 0.721) give `bad-ratio`. Ratios 0.60, 0.75, 1.0 and 1.78 give `bad-ratio`.
13. When the 2:3 output would be narrower than 250 px, the result is `too-small`. A source that gives exactly 250×375 is accepted.
14. A 2000×3000 source gives 800×1200. A 500×750 source gives 500×750. Nothing is ever enlarged.
15. HTML text, a truncated image, a zero-byte buffer and a non-image give `not-an-image` and do not throw.
16. The same input bytes always give the same output bytes.
17. A JPEG whose EXIF orientation says "rotate 90°" is judged and cut by how it is displayed, not how it is stored.
18. A PNG with transparency gives an output with no alpha channel, flattened onto white. The output carries no EXIF or other metadata.

**Request policy**

19. Every request carries `User-Agent: tree-of-books-covers/1.0 (<contact>)` with the configured contact.
20. Two requests to the same host are at least 1000 ms apart on the fake clock. Requests to two different hosts are not delayed by each other.
21. A 429 is retried after 2 s, 4 s and 8 s and succeeds if a later try succeeds. After 3 retries it gives `rate-limited`. `Retry-After: 5` waits at least 5 s. `Retry-After: 120` makes no retry and gives `rate-limited`.
22. 502, 503, 504, network errors and timeouts are retried the same way. 404 and other 4xx responses are not retried. A 403 is not retried and counts toward the circuit breaker.
23. These URLs are refused, and `fetch` is never called for them: `http:` URLs, hosts not on the list, IP addresses, `localhost`, `file:` URLs, URLs with credentials, and a redirect to any of those. A sixth redirect is refused.
24. A response whose `Content-Type` is not `image/*` is `not-an-image`. A response over 15 MB (by the header, and by bytes while reading with no header) is aborted.
25. After 12 requests for one book, no further request is made for it and its attempt is `budget-exhausted`. The next book starts with a fresh budget.
26. When a source runs out of retries (or gets a 403) twice in a row, no later book makes a request to it, and each records `source-disabled` and ends `failed`. Two failures that are not in a row (a success or a 404 between them) do not switch it off.
27. The API key and the contact address do not appear in the report, in any `detail`, in console output or in thrown error messages, even when a request fails.

**Sources**

28. **Open Library, no ISBN.** The search request contains the title and author, `limit=5` and a restricted `fields` list. The first matching result with a `cover_i` is used, and the image URL is `https://covers.openlibrary.org/b/id/<id>-L.jpg?default=false`. A recorded search with a non-matching first result (a study guide, a different author) skips it. No request in any test uses a `/b/isbn/`, `/b/oclc/` or `/b/lccn/` cover URL.
29. **Open Library, ISBN.** The edition is resolved from the ISBN to a cover ID and the image is requested by that ID. An edition with no cover is `no-cover` and the next source is tried.
30. **Matching.** Titles match ignoring case, punctuation, diacritics, `&` against `and`, and a leading article. `Dune` matches `Dune: Deluxe Edition`. `The Hobbit` does not match `SparkNotes: The Hobbit` or `The Hobbit Companion`. Authors match on surname: `J.R.R. Tolkien` matches `J. R. R. Tolkien`, and `Neil Gaiman & Terry Pratchett` matches a candidate by either one.
31. **Google Books** makes no request at all without a key (`skipped-no-key`). With a key, the key goes only to `www.googleapis.com`, the largest image link is used, the page-curl parameter is removed, a volume without image links is `no-cover`, and at most 3 candidates are returned.
32. **Commons** accepts a file only if its name contains every title word and `cover`, its type is JPEG, PNG or WebP, and its licence is CC0, CC BY, CC BY-SA or public domain. The licence text ends up in `rights`. A file with any other or no licence is rejected, and at most 3 candidates are returned.
33. **Manual.** A file `manual/<slug>.png|jpg|jpeg|webp` is used before any request is made for that book. A rejected manual file (for example `bad-ratio`) is recorded as an attempt and the online sources are tried next.

**One run**

34. Sources are tried in the order manual, Open Library, Google Books, Commons. The first candidate that passes the image rules is used and no later source is called. Rejected candidates are recorded, in order, in `attempts`.
35. A book that no source has a usable image for, where every source answered cleanly, is `missing`, has `file: null`, and does not affect any other book. If at least one source errored (see *Report* for what counts as an error, which includes `source-disabled` and `budget-exhausted`), it is `failed` instead.
36. One failing book does not stop the run, and the exit code is 1.
37. `images/` contains only `.png` files after a run. A write that fails half way leaves no `<slug>.png`. A stale `*.png.tmp` from an earlier run is removed at the start.
38. **Re-run.** A valid existing image is `skipped`: no request is made, and the file's bytes and modification time stay the same. A corrupt file, a non-PNG, a file that is not 2:3 and a file under 250 px wide are fetched again. `--force` fetches and replaces them all. `--only <slug>` touches just that book and an unknown slug is exit code 2.
39. **Report.** It passes the Zod schema. After a normal run it has one entry per list line in list order; after `--only <slug>` it has exactly one entry; after a stop it has the books handled so far. Every `ok` entry's file exists and its `outputSize` equals the file's real size. `missing` entries have `file: null`. Every `ok` entry has a non-empty `rights` and a `sourceUrl`. A `skipped` entry copies `source`, `sourceUrl` and `rights` from the previous report when it has the book, and has `null` for them when it doesn't.
40. **Stopping.** When the run's abort signal fires, no new book is started (the book in progress is finished), the report is written with `interrupted: true`, and no `.tmp` file remains. `runCovers` returns exit code 130 in that case, and the CLI passes it on. A signal that has already fired at the start means zero requests.

**Configuration and exit codes**

41. A missing or blank `COVERS_CONTACT`, or one that is neither an email address nor an `https:` URL, is exit code 2. A blank `GOOGLE_BOOKS_API_KEY` counts as not set. `loadConfig` takes an environment object, so a real variable winning over a `.env` value can be tested without files.
42. Exit code 2 (and zero requests) for each of: a missing list file, an unreadable list file, any list error from criteria 6–10, an unknown flag, two positional arguments, an unwritable `--out`, and an `--out` inside `src/` or `public/`.
43. Exit code 0 when every book is `ok` or `skipped`, and 1 when any is `missing` or `failed`.

**Manual check (by the tester, with a network; not part of CI)**

44. With `COVERS_CONTACT` set, run the command on a list of five well-known titles (one with an ISBN, one with two authors, one old classic). Open each output. Each is a real front cover, 2:3, a PNG, named by its slug. The report says where each came from. Any wrong cover, stretched image or missing book that should have been found is filed in `docs/bugs/` with the title and the report entry.

## Risks and Trade-offs

- **Cover art is almost always the publisher's copyright.** Open Library and Google Books don't license it. Only Commons files carry a free licence. The tool is meant for private, temporary working files, and the report says where each image came from, but turning a cover into a pixel-art version with an AI tool is very likely still a derivative of the cover. Whether that output may be shown in a public app is a separate question that this tool does not answer and does not enforce. The guard against `--out` inside `public/` and the git ignore only prevent accidents.
- **Open Library's guidelines are strict for what this does.** The covers API is described as meant for displaying covers on public pages, not for bulk download, and the search API for "human-centred" use and not for hundreds of single-book requests. With a cap of 100 books, one search and one image per book in the usual case, a 1-second gap, an identifying contact and no use of the rate-limited ISBN cover endpoint, this is small and polite, but it is a download for private use. The tool can't change that. The developer may want to register the use with Open Library (they offer a form) and to keep the list short.
- **"Most popular" is approximated.** Open Library's own choice of cover for a work is the signal. It can be a regional or newer reprint. The fix is an ISBN in the list. A real popularity ranking would need data we don't have.
- **The original first-edition cover is often not online.** For books from the 1800s and early 1900s, Commons may have it; for 20th-century books it usually doesn't. We did not build an "original" mode, because that would mean a second way to pick editions.
- **Cropping up to 8% off the edges** can clip text that sits at the very edge of a cover. The alternative (padding or stretching) changes the picture more. Books outside ±8% are skipped, not forced.
- **Wrong-book matches.** The title and author rules reject most look-alikes, but they cannot stop every one (two different works with the same title and a shared surname). The report shows each source URL so a wrong pick can be seen, and the ISBN column fixes it.
- **Google Books is optional and loosely specified.** Its image-link shape differs between responses and its placeholders are real images. The ratio and size rules catch most of those, and the recorded sample in the tests pins the shape.
- **Hand-written host allowlist.** It protects against a service sending the tool to an arbitrary address. The cost is that a service that moves its image hosts breaks that source until the list is updated. The report shows the refused host.
- **One TypeScript tool instead of an `.mjs` script** like the existing ones. It adds a few files, but the JSON from three services is validated with Zod and strict types, which is the project's convention.
- **Sequential and slow on purpose.** One request at a time with a 1-second gap is the price of staying within the services' limits. For 100 books that is acceptable.
- **We deliberately did not build:** a cache apart from the output folder, a committed manifest, a locking mechanism for approved covers, a contact sheet, an "original cover" mode, scraping of any website, or any link to the app.

## Breaking Changes

- **None** to the database schema, to any public route or to any external contract.
- **Internal refactor:** `slugify` moves from `prisma/seed.ts` to `src/lib/slug.ts` and the seed imports it. Output is identical (criterion 4).
- **Project files that change:** `package.json` (one script), `.gitignore` (`/.covers/`), `.env.example` (two empty variables), `vitest.config.ts` (a `tools` project) and the new `scripts/covers/**`.

## Open Questions

None of these block the work. The spec uses the answer in italics.

1. **Manual files come first.** Earlier the order was "…then manual drop-in". This spec tries `manual/` first, because a file you put there on purpose should win over a search. OK? *Proposed: manual first.*
2. **Is Open Library's choice an acceptable meaning of "most popular"?** If a pick is wrong for a book, you add its ISBN to the list. *Proposed: yes.*
3. **Register the use with Open Library?** Their API page asks applications to register. That is something you do, not the tool. *Proposed: do it before the first real run.*
4. **Should a Google Books search by ISBN skip the title and author check?** The spec now says the check applies there too (as built). An ISBN already names one edition, and a translated or retitled edition fails the title check and is dropped. *Proposed: keep as built for now; change it if a real run shows good editions being dropped.*
5. **Should `--only` keep the other books' entries in `report.json`?** Now the report holds only the books processed, and the rest are forgotten, including what a later `skipped` would copy. Merging is possible, but needs a rule for books no longer in the list. *Proposed: keep as is; the images in `images/` stay either way.*
