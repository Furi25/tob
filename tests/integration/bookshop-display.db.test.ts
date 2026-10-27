// Spec: docs/specs/bookshop-display.md — criteria #4, #5, #16, #19, #25
//
// Runs against a real Postgres. It deletes and recreates Book rows, so it refuses
// to run unless DATABASE_URL points at a database whose name contains "test".
// The DB tests must not run in parallel with other files that write to Book.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDisplayBooks } from "../../src/server/display";
import { isolatedSeedEnv } from "../support/content-import";

const root = process.cwd();
const prisma = new PrismaClient();

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error(
      "Refusing to run: DATABASE_URL must point at a disposable test database (name containing 'test').",
    );
  }
}

function runSeed(): void {
  execSync("npx prisma db seed", { cwd: root, stdio: "pipe", timeout: 120_000, env: isolatedSeedEnv() });
}

function bookData(n: number, displaySlot: number | null) {
  return {
    slug: `test-book-${n}`,
    title: `Test Book ${n}`,
    author: `Test Author ${n}`,
    tagline: `Tagline ${n}`,
    summary: `Summary ${n}`,
    about: `About text for test book ${n}`,
    whyPopular: `Why test book ${n} is popular`,
    whyItMatters: `Why test book ${n} matters`,
    affiliateUrl: `#affiliate-test-${n}`,
    popularityRank: n,
    displaySlot,
  };
}

beforeAll(() => {
  assertTestDatabase();
});

afterAll(async () => {
  // Leave the test database in its seeded state for the e2e suite.
  await prisma.book.deleteMany();
  runSeed();
  await prisma.$disconnect();
});

describe("getDisplayBooks()", () => {
  beforeEach(async () => {
    await prisma.book.deleteMany();
  });

  it("#4 returns each placed book with slot = displaySlot, sorted by slot ascending", async () => {
    await prisma.book.createMany({ data: [bookData(1, 7), bookData(2, 2), bookData(3, 19)] });

    const { books } = await getDisplayBooks();

    expect(books.map((b) => [b.slot, b.slug])).toEqual([
      [2, "test-book-2"],
      [7, "test-book-1"],
      [19, "test-book-3"],
    ]);
  });

  it("#4 leaves out books with no displaySlot", async () => {
    await prisma.book.createMany({ data: [bookData(1, null), bookData(2, 5)] });

    const { books } = await getDisplayBooks();

    expect(books.map((b) => b.slug)).toEqual(["test-book-2"]);
  });

  it("#16 returns an empty list when no book is on display", async () => {
    await prisma.book.createMany({ data: [bookData(1, null)] });

    const { books } = await getDisplayBooks();

    expect(books).toEqual([]);
  });

  it("#19 returns only slot, slug, title and author — no long-form copy", async () => {
    await prisma.book.create({ data: bookData(1, 1) });

    const { books } = await getDisplayBooks();

    expect(books).toHaveLength(1);
    expect(Object.keys(books[0]).sort()).toEqual(["author", "slot", "slug", "title"]);
    expect(books[0]).toEqual({ slot: 1, slug: "test-book-1", title: "Test Book 1", author: "Test Author 1" });
  });
});

describe("Book.displaySlot constraints", () => {
  beforeEach(async () => {
    await prisma.book.deleteMany();
  });

  it("#5 accepts the boundary slots 1 and 25", async () => {
    await prisma.book.create({ data: bookData(1, 1) });
    await prisma.book.create({ data: bookData(2, 25) });

    expect(await prisma.book.count({ where: { displaySlot: { not: null } } })).toBe(2);
  });

  it("#5 rejects a second book in an occupied slot", async () => {
    await prisma.book.create({ data: bookData(1, 3) });

    await expect(prisma.book.create({ data: bookData(2, 3) })).rejects.toMatchObject({ code: "P2002" });
  });

  it.each([0, 26, -1])("#5 rejects displaySlot %i (outside 1–25)", async (slot) => {
    await expect(prisma.book.create({ data: bookData(1, slot) })).rejects.toThrow();
    expect(await prisma.book.count()).toBe(0);
  });

  it("#5 rejects moving a book to a slot outside 1–25", async () => {
    const book = await prisma.book.create({ data: bookData(1, 4) });

    await expect(prisma.book.update({ where: { id: book.id }, data: { displaySlot: 26 } })).rejects.toThrow();
  });
});

describe("prisma db seed", () => {
  const mockupHtml = readFileSync(path.join(root, "mockups", "bookstore-display", "index.html"), "utf8");
  // The mockup's list order is the N in each link's href="#book/N" (spec: Resolved → Mockup list order).
  const mockupBooks = [...mockupHtml.matchAll(/<a href="#book\/(\d+)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({
    listNumber: Number(m[1]),
    title: m[2],
  }));

  async function slotByTitle(): Promise<Record<string, number | null>> {
    const rows = await prisma.book.findMany({ select: { title: true, displaySlot: true } });
    return Object.fromEntries(rows.map((r) => [r.title, r.displaySlot]));
  }

  it("fixture: the mockup lists 25 titles", () => {
    expect(mockupBooks).toHaveLength(25);
  });

  it("#25 seeds the 25 mockup titles into slots 1–25, each slot exactly once", async () => {
    await prisma.book.deleteMany();
    runSeed();

    const mapping = await slotByTitle();

    expect(Object.keys(mapping).sort()).toEqual(mockupBooks.map((b) => b.title).sort());
    const slots = Object.values(mapping).map((s) => s ?? -1).sort((a, b) => a - b);
    expect(slots).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("#25 two seeds from an empty table produce the same book-to-slot mapping", async () => {
    await prisma.book.deleteMany();
    runSeed();
    const first = await slotByTitle();

    await prisma.book.deleteMany();
    runSeed();

    expect(await slotByTitle()).toEqual(first);
  });

  it("#25 reseeding over existing data keeps the same book-to-slot mapping", async () => {
    await prisma.book.deleteMany();
    runSeed();
    const first = await slotByTitle();

    runSeed();

    expect(await slotByTitle()).toEqual(first);
    expect(await prisma.book.count()).toBe(25);
  });

  it("#25 the mapping is not the mockup's list order (#book/N in slot N)", async () => {
    await prisma.book.deleteMany();
    runSeed();
    const mapping = await slotByTitle();
    expect(mockupBooks, "precondition: fixture parsed").toHaveLength(25);

    const placedInListOrder = mockupBooks.every((b) => mapping[b.title] === b.listNumber);

    expect(placedInListOrder).toBe(false);
  });
});
