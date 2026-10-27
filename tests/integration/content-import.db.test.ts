// Spec: docs/specs/content-import.md — criteria #1 to #13 (the seed half) and #4b (the migration).
// The rendered halves (#14, #15) are in tests/e2e/content-import.spec.ts; the backlog and scan criteria
// (#16, #17, #20) are in scripts/content/project.test.ts.
//
// Runs against a real Postgres. It deletes and recreates rows through `prisma db seed`, so it refuses to run unless
// DATABASE_URL points at a database whose name contains "test". Every seed run points BOOK_CONTENT_FILE at a fixture,
// so the developer's real .content/books-content.json is never read (the one exception is the "no default file" case,
// which is skipped when that file exists and is never modified).
//
// Reads that involve the new `genres` column use raw SQL, so they do not depend on a regenerated Prisma client.
// These tests are red until the migration, the seed change and the replacement list exist.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANATHEM,
  ANATHEM_SCENE,
  ANATHEM_SLOT,
  approvedEntry,
  contentFile,
  DEFAULT_CONTENT_FILE,
  HOBBIT,
  NEVER_STORED,
  removeContentFixtures,
  runSeed,
  seedPlaceholdersOnly,
  seedWithContent,
  writeContentFixture,
  type ApprovedEntry,
} from "../support/content-import";

const root = process.cwd();
const prisma = new PrismaClient();
const SCENE_IDS = ["bookshop", "abbey"];
const ABBEY_SLOTS = 29;
const COPY_FIELDS = ["tagline", "summary", "about", "whyPopular", "whyItMatters", "authorBio"] as const;

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error("Refusing to run: DATABASE_URL must point at a disposable test database (name containing 'test').");
  }
}

type Row = {
  slug: string;
  title: string;
  author: string;
  tagline: string;
  summary: string;
  about: string;
  whyPopular: string;
  whyItMatters: string;
  authorBio: string | null;
  affiliateUrl: string;
  coverImage: string | null;
  palette: unknown;
  popularityRank: number;
};
type Placed = { sceneId: string; slot: number; slug: string };
type Snap = { rows: Row[]; placements: Placed[]; genres: Map<string, string[]>; totalBooks: number };

/** The seeded books (those placed in a registered scene), their placements, genres, and the size of the Book table. */
async function snapshot(): Promise<Snap> {
  const placements = await prisma.placement.findMany({
    where: { sceneId: { in: SCENE_IDS } },
    select: { sceneId: true, slot: true, bookId: true },
    orderBy: [{ sceneId: "asc" }, { slot: "asc" }],
  });
  const books = await prisma.book.findMany({
    where: { id: { in: placements.map((p) => p.bookId) } },
    select: {
      id: true,
      slug: true,
      title: true,
      author: true,
      tagline: true,
      summary: true,
      about: true,
      whyPopular: true,
      whyItMatters: true,
      authorBio: true,
      affiliateUrl: true,
      coverImage: true,
      palette: true,
      popularityRank: true,
    },
    orderBy: { slug: "asc" },
  });
  const slugOf = new Map(books.map((b) => [b.id, b.slug]));
  const rows: Row[] = books.map(({ id: _id, ...rest }) => rest);
  const genreRows = await prisma.$queryRaw<{ slug: string; genres: string[] }[]>`SELECT slug, genres FROM "Book"`;
  return {
    rows,
    placements: placements.map((p) => ({ sceneId: p.sceneId, slot: p.slot, slug: slugOf.get(p.bookId) ?? `?${p.bookId}` })),
    genres: new Map(genreRows.map((g) => [g.slug, g.genres])),
    totalBooks: await prisma.book.count(),
  };
}

const rowOf = (s: Snap, slug: string): Row => {
  const row = s.rows.find((r) => r.slug === slug);
  if (!row) throw new Error(`no seeded book with slug ${slug}`);
  return row;
};
const placedAt = (s: Snap, sceneId: string, slot: number): string | undefined =>
  s.placements.find((p) => p.sceneId === sceneId && p.slot === slot)?.slug;
const without = (rows: Row[], ...slugs: string[]) => rows.filter((r) => !slugs.includes(r.slug));
const withoutGenres = (s: Snap) => ({ rows: s.rows, placements: s.placements, totalBooks: s.totalBooks });

/** Everything the seed controls, in a form `toEqual` can compare. */
const comparable = (s: Snap) => ({ ...withoutGenres(s), genres: [...s.genres.entries()].sort(([a], [b]) => a.localeCompare(b)) });

let baseline: Snap;
let replacedSlug = "";

beforeAll(() => {
  assertTestDatabase();
});

afterAll(async () => {
  seedPlaceholdersOnly();
  removeContentFixtures();
  await prisma.$disconnect();
});

// ------------------------------------------------------------------------------------------ #1 no approved content

describe("#1 with no approved content the seed produces today's placeholders", () => {
  beforeAll(async () => {
    seedPlaceholdersOnly();
    baseline = await snapshot();
    replacedSlug = placedAt(baseline, ANATHEM_SCENE, ANATHEM_SLOT) ?? "";
  });

  it("seeds 25 books in bookshop and one per slot in abbey, all with placeholder copy", () => {
    expect(baseline.placements.filter((p) => p.sceneId === "bookshop")).toHaveLength(25);
    expect(baseline.placements.filter((p) => p.sceneId === "abbey")).toHaveLength(ABBEY_SLOTS);
    expect(baseline.rows).toHaveLength(25 + ABBEY_SLOTS);
    for (const r of baseline.rows) {
      expect(r.tagline, r.slug).toBe(`Placeholder tagline for ${r.title}.`);
      expect(r.summary, r.slug).toBe(`Placeholder summary for ${r.title}.`);
      expect(r.whyPopular, r.slug).toBe(`Placeholder: why ${r.title} is popular right now.`);
      expect(r.authorBio, r.slug).toBe(`Placeholder: a short biography of ${r.author}.`);
      expect(r.affiliateUrl, r.slug).toBe("#affiliate-pending");
    }
  });

  it("keeps popularityRank unique and continuous from 1", () => {
    const ranks = baseline.rows.map((r) => r.popularityRank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 25 + ABBEY_SLOTS }, (_, i) => i + 1));
  });

  it("puts an Abbey placeholder at the slot Anathem will take", () => {
    expect(replacedSlug, `abbey slot ${ANATHEM_SLOT}`).toMatch(/^abbey-placeholder-\d{2}$/);
  });

  it("gives every seeded book an empty genres list", () => {
    for (const r of baseline.rows) expect(baseline.genres.get(r.slug), r.slug).toEqual([]);
  });

  it.skipIf(existsSync(DEFAULT_CONTENT_FILE))(
    "seeds the same data with BOOK_CONTENT_FILE unset and no default file (exit 0)",
    async () => {
      const result = runSeed(null);
      expect(result.status, result.text).toBe(0);
      expect(result.text).toMatch(/no content file/i);
      expect(comparable(await snapshot())).toEqual(comparable(baseline));
    },
  );
});

// ------------------------------------------------------------------------------------------ approved entries

describe("with approved entries for The Hobbit and Anathem", () => {
  let A: Snap;
  let seedText = "";

  beforeAll(async () => {
    seedText = seedWithContent(HOBBIT, ANATHEM).text;
    A = await snapshot();
  });

  it("#2 a seeded classic receives the entry's six copy fields and nothing else changes", () => {
    const hobbit = rowOf(A, "the-hobbit");
    const before = rowOf(baseline, "the-hobbit");
    for (const field of COPY_FIELDS) expect(hobbit[field], field).toBe(HOBBIT[field]);
    expect({ ...hobbit, ...Object.fromEntries(COPY_FIELDS.map((f) => [f, undefined])) }).toEqual({
      ...before,
      ...Object.fromEntries(COPY_FIELDS.map((f) => [f, undefined])),
    });
    expect(placedAt(A, "bookshop", baseline.placements.find((p) => p.slug === "the-hobbit")?.slot ?? -1)).toBe("the-hobbit");
  });

  it("#3 books without an entry keep their placeholder text", () => {
    expect(without(A.rows, "the-hobbit", "anathem")).toEqual(without(baseline.rows, "the-hobbit", replacedSlug));
  });

  it("#4 sources, facts, confidence, needsReview, drafter and review are stored nowhere", async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Book'`;
    const names = columns.map((c) => c.column_name);
    for (const forbidden of ["sources", "facts", "confidence", "needsReview", "drafter", "review"]) {
      expect(names, `Book has no column ${forbidden}`).not.toContain(forbidden);
    }
    const dump = (await prisma.$queryRaw<{ row: string }[]>`SELECT row_to_json(b)::text AS row FROM "Book" b`)
      .map((r) => r.row)
      .join("\n");
    for (const [what, marker] of Object.entries(NEVER_STORED)) {
      expect(dump, `${what} marker is not in any Book row`).not.toContain(marker);
    }
  });

  it("#4a genres equal the entry's, in order; every other book has an empty list", () => {
    expect(A.genres.get("the-hobbit")).toEqual(HOBBIT.genres);
    expect(A.genres.get("anathem")).toEqual(ANATHEM.genres);
    for (const r of without(A.rows, "the-hobbit", "anathem")) expect(A.genres.get(r.slug), r.slug).toEqual([]);
  });

  it("#5 Anathem takes abbey slot 1; the counts stay 25 and 29; the replaced placeholder is gone", async () => {
    expect(placedAt(A, ANATHEM_SCENE, ANATHEM_SLOT)).toBe("anathem");
    expect(A.placements.filter((p) => p.sceneId === "bookshop")).toHaveLength(25);
    expect(A.placements.filter((p) => p.sceneId === "abbey")).toHaveLength(ABBEY_SLOTS);
    expect(await prisma.book.count({ where: { slug: replacedSlug } }), `${replacedSlug} still exists`).toBe(0);
    const placeholders = A.rows.filter((r) => r.slug.startsWith("abbey-placeholder-"));
    expect(placeholders).toHaveLength(ABBEY_SLOTS - 1);
    // Every other slot is exactly where it was.
    expect(A.placements.filter((p) => !(p.sceneId === ANATHEM_SCENE && p.slot === ANATHEM_SLOT))).toEqual(
      baseline.placements.filter((p) => !(p.sceneId === ANATHEM_SCENE && p.slot === ANATHEM_SLOT)),
    );
    const anathem = rowOf(A, "anathem");
    expect([anathem.title, anathem.author]).toEqual(["Anathem", "Neal Stephenson"]);
    for (const field of COPY_FIELDS) expect(anathem[field], field).toBe(ANATHEM[field]);
  });

  it("#6 Anathem inherits the placeholder's popularityRank; ranks stay unique and the same set", () => {
    expect(rowOf(A, "anathem").popularityRank).toBe(rowOf(baseline, replacedSlug).popularityRank);
    const ranks = A.rows.map((r) => r.popularityRank);
    expect(new Set(ranks).size, "unique popularityRank").toBe(ranks.length);
    expect([...ranks].sort((a, b) => a - b)).toEqual(baseline.rows.map((r) => r.popularityRank).sort((a, b) => a - b));
  });

  it("#7 Anathem has the fake affiliate URL and no cover or palette", () => {
    const anathem = rowOf(A, "anathem");
    expect(anathem.affiliateUrl).toBe("#affiliate-pending");
    expect(anathem.coverImage).toBeNull();
    expect(anathem.palette).toBeNull();
  });

  it("the seed prints how many books received content", () => {
    expect(seedText).toMatch(/content applied to 2 books/i);
  });

  // The toggling tests change the database step by step, so they stay in this order.
  describe("toggling and re-seeding", () => {
    it("#8 without the Anathem entry the placeholder returns with the same slot and rank, and anathem is deleted", async () => {
      seedWithContent(HOBBIT);
      const s = await snapshot();
      expect(placedAt(s, ANATHEM_SCENE, ANATHEM_SLOT)).toBe(replacedSlug);
      expect(rowOf(s, replacedSlug)).toEqual(rowOf(baseline, replacedSlug));
      expect(await prisma.book.count({ where: { slug: "anathem" } }), "anathem book").toBe(0);
      expect(without(s.rows, "the-hobbit")).toEqual(without(baseline.rows, "the-hobbit"));
    });

    it("#9 adding the entry again works, and running the seed twice in a row gives identical data", async () => {
      seedWithContent(HOBBIT, ANATHEM);
      const first = await snapshot();
      expect(comparable(first)).toEqual(comparable(A));
      seedWithContent(HOBBIT, ANATHEM);
      expect(comparable(await snapshot())).toEqual(comparable(first));
    });
  });

  describe("input the seed must refuse or tolerate", () => {
    const bad: Array<[string, () => string]> = [
      ["not valid JSON", () => writeContentFixture("{ this is not json")],
      [
        "an unknown key in an entry",
        () => writeContentFixture(contentFile({ ...HOBBIT, unexpectedKey: true } as unknown as ApprovedEntry)),
      ],
      [
        "two entries with one slug",
        () => writeContentFixture(contentFile(HOBBIT, { ...HOBBIT, tagline: "TAGLINE-second-copy" })),
      ],
      [
        "a missing required field",
        () => {
          const { review: _review, ...noReview } = HOBBIT;
          return writeContentFixture(contentFile(noReview as unknown as ApprovedEntry));
        },
      ],
    ];

    it.each(bad)("#10 %s: the seed exits non-zero, names the file, and the database is unchanged", async (_why, makeFile) => {
      const before = comparable(await snapshot());
      const file = makeFile();
      const result = runSeed(file);
      expect(result.status, result.text).not.toBe(0);
      expect(result.status, "the seed ran").not.toBeNull();
      expect(result.text, "the message names the file").toContain(path.basename(file));
      expect(comparable(await snapshot())).toEqual(before);
    });

    it("#11 an entry that matches no seeded book is ignored: exit 0, named in the summary, data as without it", async () => {
      const stray = approvedEntry("not-a-seeded-book", "A Book Nobody Seeded", "Nobody Atall");
      const file = writeContentFixture(contentFile(HOBBIT, stray));
      const result = runSeed(file);
      expect(result.status, result.text).toBe(0);
      expect(result.text).toContain("not-a-seeded-book");
      const s = await snapshot();
      expect(await prisma.book.count({ where: { slug: "not-a-seeded-book" } })).toBe(0);
      expect(without(s.rows, "the-hobbit")).toEqual(without(baseline.rows, "the-hobbit"));
      for (const field of COPY_FIELDS) expect(rowOf(s, "the-hobbit")[field], field).toBe(HOBBIT[field]);
    });

    it("#12 BOOK_CONTENT_FILE pointing at a missing path makes the seed fail and changes nothing", async () => {
      const before = comparable(await snapshot());
      const missing = path.join(path.dirname(writeContentFixture(contentFile())), "does-not-exist.json");
      const result = runSeed(missing);
      expect(result.status, result.text).not.toBe(0);
      expect(result.status, "the seed ran").not.toBeNull();
      expect(comparable(await snapshot())).toEqual(before);
    });

    it("#13 an entry whose title or author differs keeps the seed's title and author and prints a warning", async () => {
      const changed = { ...HOBBIT, title: "The Hobbit, Revised", author: "Somebody Else" };
      const result = runSeed(writeContentFixture(contentFile(changed)));
      expect(result.status, result.text).toBe(0);
      expect(result.text).toMatch(/warn/i);
      expect(result.text).toContain("the-hobbit");
      const hobbit = rowOf(await snapshot(), "the-hobbit");
      expect([hobbit.title, hobbit.author]).toEqual(["The Hobbit", "J.R.R. Tolkien"]);
      for (const field of COPY_FIELDS) expect(hobbit[field], field).toBe(HOBBIT[field]);
    });
  });
});

// ------------------------------------------------------------------------------------------ #4b the migration

describe("#4b the genres migration", () => {
  const migrations = path.join(root, "prisma", "migrations");

  it("ships as a Prisma migration that adds a NOT NULL text[] column defaulting to empty", () => {
    const folder = readdirSync(migrations).find((name) => /_add_book_genres$/.test(name));
    expect(folder, "prisma/migrations/<timestamp>_add_book_genres").toBeDefined();
    const sql = readFileSync(path.join(migrations, folder ?? "", "migration.sql"), "utf8");
    expect(sql).toMatch(/ALTER TABLE\s+"Book"\s+ADD COLUMN\s+"genres"\s+TEXT\[\]\s+NOT NULL\s+DEFAULT\s+ARRAY\[\]::TEXT\[\]/i);
  });

  it("declares genres as String[] @default([]) in schema.prisma", () => {
    const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
    expect(schema).toMatch(/genres\s+String\[\]\s+@default\(\[\]\)/);
  });

  it("is applied to the test database as a NOT NULL array column with a default", async () => {
    const rows = await prisma.$queryRaw<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_name = 'Book' AND column_name = 'genres'`;
    expect(rows, "Book.genres exists").toHaveLength(1);
    expect(rows[0].data_type).toBe("ARRAY");
    expect(rows[0].is_nullable).toBe("NO");
    expect(rows[0].column_default).not.toBeNull();
  });

  it("leaves no drift between the migrated database and schema.prisma", () => {
    // Exit code 2 means a difference. execSync throws on any non-zero exit.
    expect(() =>
      execSync(
        `npx prisma migrate diff --from-url "${process.env.DATABASE_URL}" --to-schema-datamodel prisma/schema.prisma --exit-code`,
        { cwd: root, stdio: "pipe", timeout: 120_000 },
      ),
    ).not.toThrow();
  });
});
