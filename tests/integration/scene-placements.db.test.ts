// Spec: docs/specs/multiple-bookshop-scenes.md — criteria #9 #10 #11 #12 and the getDisplayBooks(sceneId) contract.
//
// Runs against a real Postgres. It deletes and recreates rows, so it refuses to run unless DATABASE_URL points at a
// database whose name contains "test". The DB tests must not run in parallel with other files that write to Book
// (vitest.config.ts already sets fileParallelism: false).
//
// Criterion 11 needs a database that is still on the old schema. It creates a second, scratch database next to the
// test one (named tob_migration_test), applies the two existing migrations and some old-style rows with
// `prisma db execute`, applies every newer migration, then reads the result back. This needs a Postgres role that may
// CREATE DATABASE; the docker-compose and local-db.mjs roles can.
//
// Module paths for the registry are assumed as in src/components/bookshop/scenes/scenes.test.ts.
// `prisma.placement` does not exist until the schema change is generated, so these tests are red until then.
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SCENES } from "../../src/components/bookshop/scenes";
import { getDisplayBooks } from "../../src/server/display";
import { ABBEY_SLOT_COUNT } from "../support/abbey-boxes";
import { BOOKSHOP_V1_PLACEMENT } from "../support/bookshop-v1";
import { isolatedSeedEnv } from "../support/content-import";

const root = process.cwd();
const prisma = new PrismaClient();

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error("Refusing to run: DATABASE_URL must point at a disposable test database (name containing 'test').");
  }
}

function runSeed(): void {
  execSync("npx prisma db seed", { cwd: root, stdio: "pipe", timeout: 120_000, env: isolatedSeedEnv() });
}

type PlacementRow = { sceneId: string; slot: number; bookId: string };
type Mapping = Array<{ sceneId: string; slot: number; slug: string }>;

/** Every placement as (scene, slot, book slug), in a stable order. */
async function mapping(): Promise<Mapping> {
  const rows: PlacementRow[] = await prisma.placement.findMany({
    select: { sceneId: true, slot: true, bookId: true },
    orderBy: [{ sceneId: "asc" }, { slot: "asc" }],
  });
  const books = await prisma.book.findMany({ select: { id: true, slug: true } });
  const slugOf = new Map(books.map((b) => [b.id, b.slug]));
  return rows.map((r) => ({ sceneId: r.sceneId, slot: r.slot, slug: slugOf.get(r.bookId) ?? `?${r.bookId}` }));
}

const inScene = (m: Mapping, sceneId: string) => m.filter((r) => r.sceneId === sceneId);

beforeAll(() => {
  assertTestDatabase();
});

afterAll(async () => {
  // Leave the test database in its seeded state for the e2e suite.
  await prisma.placement.deleteMany({ where: { sceneId: { startsWith: "test-" } } });
  await prisma.book.deleteMany({ where: { slug: { startsWith: "placement-test-" } } });
  runSeed();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- #9 #12 what the seed produces

describe("seeded placements", () => {
  let seeded: Mapping = [];

  beforeAll(async () => {
    runSeed();
    seeded = await mapping();
  });

  it("#9 every scene has at most as many placements as slots, all in 1..N", () => {
    for (const scene of SCENES) {
      const N = scene.hotspots.length;
      const rows = inScene(seeded, scene.id);
      expect(rows.length, `${scene.id} placements`).toBeLessThanOrEqual(N);
      for (const r of rows) {
        expect(r.slot, `${scene.id} slot`).toBeGreaterThanOrEqual(1);
        expect(r.slot, `${scene.id} slot`).toBeLessThanOrEqual(N);
      }
    }
  });

  it("#9 after seeding, bookshop has 25 placements and abbey has one per slot (29)", () => {
    const abbey = SCENES.find((s) => s.id === "abbey");
    expect(abbey?.hotspots.length, "the Abbey registers its 29 hotspots").toBe(ABBEY_SLOT_COUNT);
    expect(inScene(seeded, "bookshop")).toHaveLength(25);
    expect(inScene(seeded, "abbey")).toHaveLength(ABBEY_SLOT_COUNT);
  });

  it("#9 the seed places nothing in a scene that is not registered", () => {
    const known = new Set(SCENES.map((s) => s.id));
    expect(seeded.filter((r) => !known.has(r.sceneId))).toEqual([]);
  });

  it("#9 no book is placed in both bookshop and abbey", () => {
    const shop = new Set(inScene(seeded, "bookshop").map((r) => r.slug));
    const both = inScene(seeded, "abbey").filter((r) => shop.has(r.slug)).map((r) => r.slug);
    expect(both).toEqual([]);
  });

  it("#9 the added books are placeholders with unique slugs and unique popularityRank values from 26 up", async () => {
    const bookshopSlugs = new Set(BOOKSHOP_V1_PLACEMENT.map((p) => p.slug));
    const added = await prisma.book.findMany({
      where: { slug: { notIn: [...bookshopSlugs] }, NOT: { slug: { startsWith: "placement-test-" } } },
      orderBy: { popularityRank: "asc" },
    });
    expect(added, "one added book per Abbey slot").toHaveLength(ABBEY_SLOT_COUNT);

    const slugs = added.map((b) => b.slug);
    const ranks = added.map((b) => b.popularityRank);
    expect(new Set(slugs).size, "unique slugs").toBe(slugs.length);
    expect(new Set(ranks).size, "unique popularityRank").toBe(ranks.length);
    for (const rank of ranks) expect(rank, "popularityRank").toBeGreaterThanOrEqual(26);

    // Seed section of the spec: Abbey Placeholder 01…, slug abbey-placeholder-01…, Placeholder Author, #affiliate-pending.
    const nn = (i: number) => String(i).padStart(2, "0");
    const expectedSlugs = Array.from({ length: ABBEY_SLOT_COUNT }, (_, i) => `abbey-placeholder-${nn(i + 1)}`);
    expect([...slugs].sort()).toEqual(expectedSlugs);
    for (const b of added) {
      const n = /^abbey-placeholder-(\d{2})$/.exec(b.slug)?.[1];
      expect(b.title, b.slug).toBe(`Abbey Placeholder ${n}`);
      expect(b.author, b.slug).toBe("Placeholder Author");
      expect(b.affiliateUrl, b.slug).toBe("#affiliate-pending");
    }
  });

  it("#9 every added book is placed in abbey", async () => {
    const abbeySlugs = new Set(inScene(seeded, "abbey").map((r) => r.slug));
    expect([...abbeySlugs].sort()).toEqual(
      Array.from({ length: ABBEY_SLOT_COUNT }, (_, i) => `abbey-placeholder-${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("#12 bookshop keeps the same 25 books in the same slots as before the change", () => {
    const actual = inScene(seeded, "bookshop").map((r) => ({ slug: r.slug, slot: r.slot }));
    const expected = [...BOOKSHOP_V1_PLACEMENT].sort((a, b) => a.slot - b.slot);
    expect(actual).toEqual(expected);
  });

  it("#12 reseeding gives the same book-to-slot mapping in every scene", async () => {
    runSeed();
    expect(await mapping()).toEqual(seeded);
  });

  it("#12 reseeding after the placements were wiped restores the same mapping", async () => {
    await prisma.placement.deleteMany();
    runSeed();
    expect(await mapping()).toEqual(seeded);
  });

  it("#12 reseeding after two abbey books swapped slots puts them back", async () => {
    const rows = await prisma.placement.findMany({ where: { sceneId: "abbey", slot: { in: [1, 2] } }, orderBy: { slot: "asc" } });
    expect(rows, "precondition: abbey has slots 1 and 2").toHaveLength(2);
    await prisma.$transaction([
      prisma.placement.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } }),
      prisma.placement.create({ data: { sceneId: "abbey", slot: 1, bookId: rows[1].bookId } }),
      prisma.placement.create({ data: { sceneId: "abbey", slot: 2, bookId: rows[0].bookId } }),
    ]);
    expect(await mapping(), "precondition: the swap changed the mapping").not.toEqual(seeded);

    runSeed();

    expect(await mapping()).toEqual(seeded);
  });
});

// ---------------------------------------------------------------- getDisplayBooks(sceneId)

describe("getDisplayBooks(sceneId)", () => {
  beforeAll(() => {
    runSeed();
  });

  it.each(SCENES.map((s) => s.id))("returns scene %s's books sorted by slot, each as { slot, slug, title, author }", async (sceneId) => {
    const expected = inScene(await mapping(), sceneId);
    const { books } = await getDisplayBooks(sceneId);

    expect(books.map((b) => [b.slot, b.slug])).toEqual(expected.map((r) => [r.slot, r.slug]));
    for (const b of books) expect(Object.keys(b).sort()).toEqual(["author", "slot", "slug", "title"]);
  });

  it("returns no bookshop book for abbey and no abbey book for bookshop", async () => {
    const shop = new Set((await getDisplayBooks("bookshop")).books.map((b) => b.slug));
    const abbey = (await getDisplayBooks("abbey")).books.map((b) => b.slug);
    expect(abbey.filter((slug) => shop.has(slug))).toEqual([]);
  });

  it("returns an empty list for an id with no placements", async () => {
    expect(await getDisplayBooks("test-no-such-scene")).toEqual({ books: [] });
  });
});

// ---------------------------------------------------------------- #10 Placement constraints

describe("#10 Placement constraints", () => {
  const bookIds: string[] = [];

  const bookData = (n: number) => ({
    slug: `placement-test-${n}`,
    title: `Placement Test ${n}`,
    author: `Placement Author ${n}`,
    tagline: `Tagline ${n}`,
    summary: `Summary ${n}`,
    about: `About ${n}`,
    whyPopular: `Why popular ${n}`,
    whyItMatters: `Why it matters ${n}`,
    affiliateUrl: "#affiliate-pending",
    popularityRank: 9_000 + n,
  });

  beforeAll(async () => {
    await prisma.book.deleteMany({ where: { slug: { startsWith: "placement-test-" } } });
    for (const n of [1, 2, 3]) bookIds.push((await prisma.book.create({ data: bookData(n) })).id);
  });

  afterEach(async () => {
    await prisma.placement.deleteMany({ where: { sceneId: { startsWith: "test-" } } });
  });

  const place = (sceneId: string, slot: number, bookId: string) => prisma.placement.create({ data: { sceneId, slot, bookId } });
  const count = (sceneId: string) => prisma.placement.count({ where: { sceneId } });

  it("accepts a valid placement", async () => {
    await place("test-a", 1, bookIds[0]);
    expect(await count("test-a")).toBe(1);
  });

  it("rejects a second book in the same (scene, slot), and keeps the first", async () => {
    await place("test-a", 1, bookIds[0]);
    await expect(place("test-a", 1, bookIds[1])).rejects.toMatchObject({ code: "P2002" });
    expect(await count("test-a")).toBe(1);
  });

  it("rejects the same book twice in one scene", async () => {
    await place("test-a", 1, bookIds[0]);
    await expect(place("test-a", 2, bookIds[0])).rejects.toMatchObject({ code: "P2002" });
    expect(await count("test-a")).toBe(1);
  });

  it.each([0, -1])("rejects slot %i (slot must be at least 1)", async (slot) => {
    await place("test-a", 1, bookIds[0]); // control: the table works, so a rejection below is the CHECK
    await expect(place("test-a", slot, bookIds[1])).rejects.toThrow();
    expect(await count("test-a")).toBe(1);
  });

  it("allows the same book in two scenes", async () => {
    await place("test-a", 1, bookIds[0]);
    await place("test-b", 1, bookIds[0]);
    expect(await count("test-a")).toBe(1);
    expect(await count("test-b")).toBe(1);
  });

  it("allows the same slot number in two scenes", async () => {
    await place("test-a", 4, bookIds[0]);
    await place("test-b", 4, bookIds[1]);
    expect(await count("test-a")).toBe(1);
    expect(await count("test-b")).toBe(1);
  });

  it("deletes a book's placements, in every scene, when the book is deleted", async () => {
    const gone = (await prisma.book.create({ data: bookData(4) })).id;
    await place("test-a", 1, gone);
    await place("test-b", 1, gone);
    await place("test-a", 2, bookIds[0]);

    await prisma.book.delete({ where: { id: gone } });

    expect(await prisma.placement.count({ where: { bookId: gone } })).toBe(0);
    expect(await count("test-a"), "other books' placements stay").toBe(1);
    expect(await count("test-b")).toBe(0);
  });
});

// ---------------------------------------------------------------- #11 the migration keeps today's data

describe("#11 the migration on a database seeded under the old schema", () => {
  const OLD_MIGRATIONS = ["20261024000000_init_book", "20261024190048_add_book_author_bio"];
  const SCRATCH = "tob_migration_test";
  const migrationsDir = path.join(root, "prisma", "migrations");

  const scratchUrl = (): string => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    url.pathname = `/${SCRATCH}`;
    return url.toString();
  };

  const dbExecute = (file: string, url: string) =>
    execSync(`npx prisma db execute --file "${file}" --url "${url}"`, { cwd: root, stdio: "pipe", timeout: 120_000 });

  const sqlOf = (name: string) => readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");

  // Three placed books (slots 3, 17, 25) and two unplaced ones, written the way the old seed wrote them.
  const OLD_ROWS: Array<{ slug: string; rank: number; slot: number | null }> = [
    { slug: "mig-a", rank: 1, slot: 17 },
    { slug: "mig-b", rank: 2, slot: 3 },
    { slug: "mig-c", rank: 3, slot: null },
    { slug: "mig-d", rank: 4, slot: 25 },
    { slug: "mig-e", rank: 5, slot: null },
  ];
  const insertOldRows = (): string =>
    `INSERT INTO "Book" ("id","slug","title","author","tagline","summary","about","whyPopular","whyItMatters","affiliateUrl","popularityRank","displaySlot","updatedAt") VALUES\n` +
    OLD_ROWS.map(
      (r) =>
        `('id-${r.slug}','${r.slug}','Title ${r.slug}','Author','t','s','a','w','m','#affiliate-pending',${r.rank},${r.slot ?? "NULL"},CURRENT_TIMESTAMP)`,
    ).join(",\n") +
    ";\n";

  const newMigrations = () =>
    readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !OLD_MIGRATIONS.includes(e.name))
      .map((e) => e.name)
      .sort();

  it("keeps bookshop's books and slots, and drops Book.displaySlot", async () => {
    const added = newMigrations();
    expect(added, "precondition: the change ships as at least one new migration (prisma/migrations)").not.toHaveLength(0);
    for (const name of added) {
      expect(name > OLD_MIGRATIONS[OLD_MIGRATIONS.length - 1], `${name} sorts after the existing migrations`).toBe(true);
    }

    const tmp = mkdtempSync(path.join(os.tmpdir(), "tob-migration-"));
    const scratch = new PrismaClient({ datasourceUrl: scratchUrl() });
    try {
      await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
      await prisma.$executeRawUnsafe(`CREATE DATABASE ${SCRATCH}`);

      const oldState = path.join(tmp, "old-state.sql");
      writeFileSync(oldState, OLD_MIGRATIONS.map(sqlOf).join("\n") + "\n" + insertOldRows());
      dbExecute(oldState, scratchUrl());

      const upgrade = path.join(tmp, "upgrade.sql");
      writeFileSync(upgrade, added.map(sqlOf).join("\n"));
      dbExecute(upgrade, scratchUrl());

      const placements = await scratch.placement.findMany({ orderBy: [{ sceneId: "asc" }, { slot: "asc" }] });
      const slugOf = new Map((await scratch.book.findMany({ select: { id: true, slug: true } })).map((b) => [b.id, b.slug]));
      const actual = placements.map((p) => ({ sceneId: p.sceneId, slot: p.slot, slug: slugOf.get(p.bookId) }));
      const expected = OLD_ROWS.filter((r) => r.slot !== null)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
        .map((r) => ({ sceneId: "bookshop", slot: r.slot, slug: r.slug }));
      expect(actual).toEqual(expected);

      expect(await scratch.book.count(), "no book is lost").toBe(OLD_ROWS.length);

      const columns = await scratch.$queryRaw<Array<{ column_name: string }>>(
        Prisma.sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'Book' AND column_name = 'displaySlot'`,
      );
      expect(columns, "Book.displaySlot is gone").toEqual([]);
    } finally {
      await scratch.$disconnect();
      await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 240_000);
});
