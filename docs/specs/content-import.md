# Approved Content Import

## Goal

Approved editorial copy from `.content/books-content.json` (written by `content approve`, see [book-content-tool.md](book-content-tool.md)) appears in the store. After the developer reseeds, every seeded book that has an approved entry shows its real tagline, summary, about, why-popular, why-it-matters and author bio on `/books/[slug]`, instead of placeholder text. The first book to go live this way is *Anathem* by Neal Stephenson, which replaces the placeholder at slot 1 of the Abbey scene. Each book's genres are stored in the database as well, ready for a later feature that uses them. This closes the "later spec" that the content tool deliberately left open.

## Scope

**In scope**

- `prisma/seed.ts` reads the approved content file, validates it, and merges the copy fields and the genres into the books it seeds, matched by slug.
- A new `Book.genres` column and its Prisma migration (the only schema change).
- A seed-side list of **replacements**: real books (starting with *Anathem*) that take the place of one Abbey placeholder book, keeping its slot and `popularityRank`.
- Adding *Anathem* to `docs/book-backlog.json` so `content status` lists it alongside the approved entry.
- Safe re-seeding in both directions (content present, then absent, then present again) without a `popularityRank` or slug collision.
- A path override for the content file so tests can seed from a fixture.
- A short seed summary on the console: how many books received content, which entries were ignored.

**Out of scope**

- **Using genres.** They are stored, nothing reads them: no filter, shelf, route, component or search. Normalising genre labels (`Sci-fi` versus `Science fiction`) is also out.
- Covers, palettes, `affiliateUrl` (stays `#affiliate-pending`) and `popularityRank` values. Covers are [book-cover-fetcher.md](book-cover-fetcher.md); the app does not show them yet.
- Any change to routes, components, scene artwork or hotspots. The detail page already renders these fields ([book-detail-page.md](book-detail-page.md)).
- Any change to the content tool's code or the approval rules. The backlog file gets exactly one new entry (see Data Model).
- Adding books to the `bookshop` scene (its 25 slots are full) or adding new hotspots.
- Re-verifying sources or drafts at seed time. Approval is the human review; the seed trusts an entry that passes the schema.
- Committing `.content/` (undecided, see Open Question 1).
- Importing at request time. The app never reads the file; only the seed does.

## Data Model

**One schema change: a `genres` column on `Book`. This needs a Prisma migration (`prisma/migrations/<timestamp>_add_book_genres`). It is additive and has a default, so existing rows and every test fixture that creates a `Book` without genres keep working.**

```prisma
// prisma/schema.prisma — Book, illustrative addition
  /// Genre labels from the approved content (1–5, free text, most specific first); empty = none known.
  genres         String[] @default([])
```

The column is a Postgres `text[]`. It holds the labels exactly as the content file has them, with no normalisation. Placeholder books have `[]`.

### Backlog entry

`docs/book-backlog.json` gets one more entry, appended after the existing 29:

```json
{ "title": "Anathem", "author": "Neal Stephenson", "origin": "other" }
```

The slug is `anathem`, which equals the content entry's slug.

### Field mapping

| Content entry field | `Book` field | Rule |
|---|---|---|
| `tagline`, `summary`, `about`, `whyPopular`, `whyItMatters`, `authorBio` | the field of the same name | Overwrites the seed's placeholder on every seed run |
| `genres` | `genres` | Copied as is, in order. A book without an entry gets `[]` |
| `slug` | `slug` | Match key. For a replacement the slug is `slugify(title)` of the replacement's title |
| `title`, `author` | `title`, `author` | Not imported for books already in the seed (the seed's values win; a difference is a console warning). For a replacement they are the seed constant's values |
| `sources`, `facts`, `confidence`, `needsReview`, `drafter`, `review` | none | Ignored |

Books without an entry keep today's placeholder text exactly.

### Content file source

- Default path: `.content/books-content.json`, relative to the current directory (the repo root when run through `prisma db seed`).
- Override: environment variable `BOOK_CONTENT_FILE`, an absolute or relative path. Used by tests. Read in the seed only; it is never reachable from client code.
- Parsed with `ContentFileSchema` from `scripts/content/schema.ts` (Zod, strict). That module imports only `zod` and `./limits`, so it is safe for the seed to import.

### Replacements (seed constant, illustrative)

```ts
// prisma/seed.ts — illustrative, not working code
type Replacement = {
  sceneId: string;   // "abbey"
  slot: number;      // 1..N, the hotspot the real book takes over: 1 for Anathem (decided 2026-10-26)
  title: string;     // "Anathem"
  author: string;    // "Neal Stephenson"
};
const REPLACEMENTS: readonly Replacement[] = [{ sceneId: "abbey", slot: 1, title: "Anathem", author: "Neal Stephenson" }];
```

A replacement is **active** only when the content file has an entry whose `slug` equals `slugify(title)`. An inactive replacement changes nothing: the placeholder stays.

### Seed behaviour

1. Read and validate the content file **before** opening the transaction.
2. Build the scene's book list as today (`booksFor`). For an active replacement, the book at the position whose shuffled slot equals `slot` is the real book instead of the placeholder. That book keeps the placeholder's position, so it keeps the same slot and the same `popularityRank`.
3. For every replacement (active or not), delete the `Book` row that is **not** in use this run, by slug: the placeholder when the replacement is active, the real book when it is inactive. This avoids a duplicate `popularityRank` (unique) when the two toggle between runs. `Placement` rows cascade.
4. Upsert books by slug as today. For books with an entry, the six copy fields and `genres` come from the entry; every other field is the seed's value, unchanged. Books without an entry get `genres: []` on both create and update.
5. Everything stays inside the existing single transaction; a failure leaves the database as it was.

## API Contracts

No Server Action, no route handler, no change to any public route or external contract. The only interface is the seed.

**Seed run** (`npx prisma db seed`)

| Input | Result |
|---|---|
| File missing | Seed runs exactly as before this spec; one info line "no content file, using placeholders". Exit 0 |
| File present and valid | Merge as above; summary line: `content applied to N books, ignored M entries (<slugs>)`. Exit 0 |
| File present, not valid JSON or fails `ContentFileSchema` | Hard error (decided 2026-10-26): the seed stops before any database write, prints the file path and the first issues. Exit 1 |
| Entry whose slug matches no seeded book and no replacement | Ignored; its slug is listed in the summary. Exit 0 |
| Two entries with the same slug | Treated as invalid (exit 1) |
| `BOOK_CONTENT_FILE` set to a path that does not exist | Error: an explicit path must exist. Exit 1 |

No auth: the seed is a developer command run against the developer's own database.

## UI Surface

No new routes, components or states. What changes is the data behind existing pages:

- `/books/anathem` exists (it did not before) and renders all six sections with real text. The book-detail page's existing empty-section rules still apply.
- `/shops/abbey` (and the landing page if it shows the abbey) shows *Anathem* at the replaced slot; the hotspot link goes to `/books/anathem`.
- The replaced placeholder (`/books/abbey-placeholder-NN`) no longer exists and returns the existing not-found page.
- Server vs client: unchanged. Nothing in `src/` imports the content file or the seed.

## Acceptance Criteria

Tests that seed use `BOOK_CONTENT_FILE` pointing at a fixture file. They never read the developer's real `.content/`.

1. With no content file, the database after seeding is identical to today's: same books, copy, slugs, ranks, placements.
2. With a valid fixture entry for a seeded classic (for example `the-hobbit`), after seeding that book's `tagline`, `summary`, `about`, `whyPopular`, `whyItMatters` and `authorBio` equal the entry's values; its `title`, `author`, `slug`, `popularityRank`, `affiliateUrl` and placement are unchanged.
3. Books without an entry keep their placeholder text.
4. `sources`, `facts`, `confidence`, `needsReview`, `drafter` and `review` are stored nowhere in the database.
4a. After seeding with a fixture entry, the book's `genres` equal the entry's `genres`, in the same order. Books without an entry, and every placeholder book, have `genres` equal to `[]`.
4b. The migration applies cleanly on a database that already holds seeded books: existing rows get `genres = []` and nothing else changes. `npx prisma migrate dev` leaves no pending drift (`prisma migrate diff` against the schema is empty).
5. With an active replacement for *Anathem*, the `abbey` scene still has exactly N placements and `bookshop` still has 25. The placement at slot 1 of `abbey` points to the book with slug `anathem`, and no `abbey-placeholder-NN` book exists for the replaced position.
6. The *Anathem* book has the replaced placeholder's `popularityRank`; all `popularityRank` values remain unique and the set of ranks is the same as before the replacement.
7. `affiliateUrl` of *Anathem* is `#affiliate-pending`; `coverImage` and `palette` are null.
8. With the *Anathem* entry removed from the fixture, reseeding restores the placeholder at the same slot with the same rank and deletes the `anathem` book, with no unique-constraint error.
9. Reseeding with the *Anathem* entry added again succeeds, and running the seed twice in a row gives identical data (idempotent).
10. A fixture that is not valid JSON, has an unknown key, or has two entries with one slug makes the seed exit non-zero, and the database is unchanged (compare row counts and a checksum of the copy fields before and after).
11. An entry whose slug matches no book and no replacement is ignored: the seed exits 0, the database equals criterion 1 for those books, and the console summary names the slug.
12. `BOOK_CONTENT_FILE` pointing at a missing path makes the seed exit non-zero; leaving it unset with no default file exits 0 (criterion 1).
13. An entry whose `title` or `author` differs from the seed's for the same slug does not change the book's title or author, and the seed prints a warning naming the slug.
14. End to end (Playwright, seeded from the fixture): `/books/anathem` returns 200, shows the title and author, and shows the "What it's about", "Why people are reading it", "Why it matters" and "About the author" sections with the fixture text; the page `<meta name="description">` equals the entry's `summary`; `/shops/abbey` has a link to `/books/anathem` at slot 1.
15. `/books/abbey-placeholder-NN` for the replaced position returns the not-found page (criterion 5 in the browser).
16. A scan of `src/` and `tests/e2e/` finds no reference to `.content`, `books-content.json` or `BOOK_CONTENT_FILE`. Only `prisma/seed.ts` and test support code (`tests/support`, `tests/integration`) mention them.
17. `docs/book-backlog.json` is valid and has 30 entries: the 29 of the content tool spec (criterion 20 there) followed by `Anathem` / `Neal Stephenson` / `other`. `content status` run against it lists `anathem`, and its slug equals the fixture entry's slug.
18. `npm run typecheck`, `npm run lint` and `npm run test` pass, with the amended tests listed under Risks.

## Risks and Trade-offs

- **Breaking: a database schema change.** `Book.genres` is a new column with a Prisma migration. It is additive and defaulted, so no existing query, fixture or route breaks, but every environment must run the migration before reseeding. No public route or external contract changes.
- **Breaking, in tests and specs.** These existing statements conflict and must be amended together with this spec:
  - [book-content-tool.md](book-content-tool.md) criterion 20 ("exactly the 29 entries") becomes 30, and the content tool's backlog test that checks it must follow. Its *Out of scope* line on genres ("no `Book` column uses them yet") no longer holds.
  - Test support that builds a `Book` by hand (`tests/e2e/support/book-fixtures.ts` and the db tests) needs no change thanks to the default, but must not break on the new column.
  - [book-content-tool.md](book-content-tool.md) criterion 38 ("no reference to `.content` or `books-content.json` in `src/`, `prisma/`, `tests/e2e/`; `prisma/seed.ts` unchanged") and its *Out of scope* line about using the output. Criterion 38 becomes: no reference in `src/` or `tests/e2e/`; `prisma/seed.ts` may read the file.
  - [multiple-bookshop-scenes.md](multiple-bookshop-scenes.md), seed section and criterion 9 ("29 placeholder books, `abbey-placeholder-01…`, ranks 26 and up all placeholders"): one position can now be a real book.
  - `tests/integration/scene-placements.db.test.ts` test #9 asserts every added book is `Placeholder Author`; it must tolerate configured replacements.
- **The seed result now depends on a gitignored file.** A fresh clone or CI seeds placeholders only; the developer's machine seeds real text. This is deliberate (criterion 1 keeps CI working) but means production data comes from whoever last seeded with the file present. Open Question 1 covers committing it.
- **Rank collision on toggling.** Because `popularityRank` is unique and a replacement inherits the placeholder's rank, seeding with and without the entry would collide unless the unused row is deleted. Seed behaviour step 3 handles this and criteria 8–9 test it. The swapped-out book's row (and its placement) is hard-deleted, which is fine for placeholders and for a book whose content is later removed, but would not be fine for a book with user data. There is none today.
- **Real copy is far longer than placeholders** (summary up to 480 characters, long-form fields up to 360 words). The detail page and the meta description have only been tested with short text. A visual check of `/books/anathem` is part of the tester's review; layout fixes would be a bug report, not part of this spec.
- **Partial verification goes live (decided 2026-10-26).** The *Anathem* entry was approved with warnings accepted: three facts are `not-found` on the cited page, and `needsReview` still lists open points. The seed does not block on this; the human approval is the gate, and every approved entry is imported.
- **Free-text genres.** Labels are stored as written, so `Science fiction` and `Sci-fi` can coexist across books. Any feature that uses genres will have to normalise them or move to a fixed list first (see [book-content-tool.md](book-content-tool.md), Risks).
- **Seed imports from `scripts/content`.** One small coupling, limited to the schema module that already depends only on `zod`. Duplicating the schema would let the two drift, which is worse.
- **Chose not to:** store the whole entry as JSON on `Book`, use a `Genre` table (a plain array is enough while nothing reads it), read the file at runtime, or require `complete` verification.

## Open Questions

Decided on 2026-10-26: `genres` go into the database; *Anathem* takes Abbey slot 1; every approved entry is imported whatever its verification state; *Anathem* is added to the backlog; a malformed content file is a hard error.

1. **Should the approved file be committed?** Today `.content/` is gitignored, so other developers and CI see placeholders. Committing `.content/books-content.json` (or moving it to `docs/`) would make the live copy reproducible but reverses the content tool's decision. This spec assumes it stays uncommitted until answered; nothing else in the spec depends on the answer.
