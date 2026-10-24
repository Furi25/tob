// Spec: docs/specs/book-detail-page.md — criteria #3, #8, #12, #13, #15, #16, #17, #18, #26
// (loader and data-layer halves; the rendered halves are in tests/e2e/book-detail-page.spec.ts)
//
// Runs against a real Postgres. It deletes and recreates Book rows, so it refuses
// to run unless DATABASE_URL points at a database whose name contains "test".
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PALETTE, getBookBySlug } from "../../src/server/books";
import { isReadable, type PaletteInput } from "../support/contrast";

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
  execSync("npx prisma db seed", { cwd: root, stdio: "pipe", timeout: 120_000 });
}

const SLUG = "detail-fixture";

const READABLE: PaletteInput = { primary: "#1d3557", surface: "#f1faee", text: "#1d1d1d", highlight: "#7a1f2b" };
const UNREADABLE: PaletteInput = { primary: "#777777", surface: "#888888", text: "#999999", highlight: "#aaaaaa" };

type Overrides = {
  tagline?: string;
  summary?: string;
  about?: string;
  authorBio?: string | null;
  affiliateUrl?: string;
  coverImage?: string | null;
  palette?: Prisma.InputJsonValue | null;
  displaySlot?: number | null;
};

async function putBook(o: Overrides = {}): Promise<void> {
  const { palette, ...rest } = o;
  await prisma.book.create({
    data: {
      slug: SLUG,
      title: "The Quiet Lantern",
      author: "Imogen Testwell",
      tagline: "A small light in a long library.",
      summary: "A short summary of the quiet lantern.",
      about: "About the quiet lantern.",
      whyPopular: "Why readers carry the lantern.",
      whyItMatters: "Why the lantern matters.",
      authorBio: "Imogen Testwell writes about lights.",
      affiliateUrl: "#affiliate-pending",
      coverImage: null,
      popularityRank: 947,
      displaySlot: null,
      ...rest,
      palette: palette === undefined || palette === null ? Prisma.DbNull : palette,
    },
  });
}

async function load() {
  const book = await getBookBySlug(SLUG);
  if (!book) throw new Error("precondition: getBookBySlug found the fixture book");
  return book;
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

describe("getBookBySlug()", () => {
  beforeEach(async () => {
    await prisma.book.deleteMany();
  });

  it("returns null for a well-formed slug that no book has (#4 data half)", async () => {
    await putBook();
    expect(await getBookBySlug("no-such-book")).toBeNull();
  });

  it("#3 finds a book with displaySlot = null", async () => {
    await putBook({ displaySlot: null });
    expect((await load()).title).toBe("The Quiet Lantern");
  });

  it("returns exactly the BookDetail fields, with nothing the page must not show (#10 data half)", async () => {
    await putBook({ displaySlot: 4 });
    const book = await load();
    expect(Object.keys(book).sort()).toEqual(
      [
        "about",
        "author",
        "authorBio",
        "buyUrl",
        "coverImage",
        "palette",
        "slug",
        "summary",
        "tagline",
        "title",
        "whyItMatters",
        "whyPopular",
      ].sort(),
    );
    expect(book).toMatchObject({
      slug: SLUG,
      title: "The Quiet Lantern",
      author: "Imogen Testwell",
      tagline: "A small light in a long library.",
      summary: "A short summary of the quiet lantern.",
      about: "About the quiet lantern.",
      whyPopular: "Why readers carry the lantern.",
      whyItMatters: "Why the lantern matters.",
      authorBio: "Imogen Testwell writes about lights.",
    });
  });

  it("#8 passes authorBio = null through as null", async () => {
    await putBook({ authorBio: null });
    expect((await load()).authorBio).toBeNull();
  });

  describe("buyUrl", () => {
    it("#12 is the affiliateUrl when it is a valid https URL", async () => {
      await putBook({ affiliateUrl: "https://shop.example.com/buy/quiet-lantern?ref=tob" });
      expect((await load()).buyUrl).toBe("https://shop.example.com/buy/quiet-lantern?ref=tob");
    });

    it.each([
      ["the seed placeholder", "#affiliate-pending"],
      ["an http URL", "http://shop.example.com/buy/quiet-lantern"],
      ["a javascript: URL", "javascript:alert(1)"],
      ["a mixed-case javascript: URL", "JavaScript:alert(1)"],
      ["a relative path", "/buy/quiet-lantern"],
      ["a protocol-relative URL", "//shop.example.com/buy"],
      ["an empty string", ""],
      ["not a URL", "buy it somewhere"],
    ])("#13 is null for %s", async (_why, affiliateUrl) => {
      await putBook({ affiliateUrl });
      expect((await load()).buyUrl).toBeNull();
    });
  });

  describe("coverImage", () => {
    it.each(["/covers/the-hobbit.webp", "/covers/quiet-lantern.png", "/covers/1984.jpg"])(
      "#15 keeps the valid local path %s",
      async (coverImage) => {
        await putBook({ coverImage });
        expect((await load()).coverImage).toBe(coverImage);
      },
    );

    it.each([
      ["null", null],
      ["an absolute URL", "https://images.example.com/c.webp"],
      ["a protocol-relative URL", "//images.example.com/c.webp"],
      ["a javascript: URL", "javascript:alert(1)"],
      ["a path outside /covers/", "/images/c.webp"],
      ["a path with ..", "/covers/../secret.webp"],
      ["a nested path", "/covers/a/b.webp"],
      ["another extension", "/covers/c.svg"],
      ["uppercase", "/covers/The-Hobbit.webp"],
      ["an empty string", ""],
    ])("#16 is null for %s", async (_why, coverImage) => {
      await putBook({ coverImage });
      expect((await load()).coverImage).toBeNull();
    });
  });

  describe("palette", () => {
    it("precondition: the fixture palettes are on the intended side of the readability rule", () => {
      expect(isReadable(READABLE)).toBe(true);
      expect(isReadable(UNREADABLE)).toBe(false);
    });

    it("#17 keeps a valid, readable palette", async () => {
      await putBook({ palette: READABLE });
      expect((await load()).palette).toEqual(READABLE);
    });

    it.each<[string, Prisma.InputJsonValue | null]>([
      ["null", null],
      ["a missing key", { primary: "#1d3557", surface: "#f1faee", text: "#1d1d1d" }],
      ["an extra key", { ...READABLE, accent: "#000000" }],
      ["a non-hex value", { ...READABLE, surface: "red; background: url(x)" }],
      ["a short hex value", { ...READABLE, text: "#111" }],
      ["a non-string value", { ...READABLE, text: 0 }],
      ["an array", [READABLE.primary, READABLE.surface, READABLE.text, READABLE.highlight]],
      ["a string", "#1d3557"],
      ["an unreadable palette", UNREADABLE],
    ])("#18 falls back to DEFAULT_PALETTE for %s", async (_why, palette) => {
      await putBook({ palette });
      expect((await load()).palette).toEqual(DEFAULT_PALETTE);
    });
  });
});

describe("authorBio migration and seed (#26)", () => {
  it("adds authorBio as a nullable text column", async () => {
    const rows = await prisma.$queryRaw<Array<{ is_nullable: string; data_type: string }>>`
      SELECT is_nullable, data_type FROM information_schema.columns
      WHERE table_name = 'Book' AND column_name = 'authorBio'`;
    expect(rows).toEqual([{ is_nullable: "YES", data_type: "text" }]);
  });

  it("ships as its own additive migration that does not rewrite or drop existing data", () => {
    const dir = path.join(root, "prisma", "migrations");
    const migrations = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dir, d.name, "migration.sql"))
      .filter((file) => existsSync(file) && readFileSync(file, "utf8").includes('"authorBio"'));
    expect(migrations, "exactly one migration mentions authorBio").toHaveLength(1);

    const sql = readFileSync(migrations[0], "utf8");
    expect(sql).toMatch(/ALTER TABLE "Book" ADD COLUMN\s+"authorBio" TEXT\s*;/);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/"authorBio" TEXT NOT NULL/i);
  });

  it("after prisma db seed every book has a non-empty authorBio, and a second seed changes nothing", async () => {
    await prisma.book.deleteMany();
    runSeed();
    const snapshot = async () =>
      // updatedAt is the only column an idempotent upsert may change.
      (await prisma.book.findMany({ orderBy: { slug: "asc" } })).map((row) => ({ ...row, updatedAt: null }));

    const first = await snapshot();
    expect(first).toHaveLength(25);
    for (const book of first) {
      expect(typeof book.authorBio, book.slug).toBe("string");
      expect((book.authorBio ?? "").trim(), book.slug).not.toBe("");
    }

    runSeed();
    expect(await snapshot()).toEqual(first);
  });
});
