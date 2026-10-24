// Test-only fixture book for docs/specs/book-detail-page.md.
// One book with a reserved slug, recreated per test with the fields under test.
// Every write is guarded so it can never touch a non-test database.
import { Prisma } from "@prisma/client";
import { assertTestDatabase, prisma } from "./db";

export const FIXTURE_SLUG = "e2e-detail-fixture";
/** Distinctive so #10 can check it never shows up in the visible page. */
export const FIXTURE_RANK = 947;

export type FixtureBook = {
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
  palette: Prisma.InputJsonValue | null;
};

export const FIXTURE_BASE: FixtureBook = {
  title: "The Quiet Lantern",
  author: "Imogen Testwell",
  tagline: "A small light carried through a long library.",
  summary: "SUMMARY-META-ONLY: a quiet book about a lantern.",
  about: "A night porter carries one lantern through every room of a sleeping library.",
  whyPopular: "Readers keep passing it hand to hand after one late-night reading went viral.",
  whyItMatters: "It treats small, steady attention as a kind of courage.",
  authorBio: "Imogen Testwell writes short novels about lights, rooms and the people who mind them.",
  affiliateUrl: "#affiliate-pending",
  coverImage: null,
  palette: null,
};

/** Replaces the fixture book and returns the values it was created with. */
export async function putFixture(overrides: Partial<FixtureBook> = {}): Promise<FixtureBook> {
  assertTestDatabase();
  const book: FixtureBook = { ...FIXTURE_BASE, ...overrides };
  await prisma.book.deleteMany({ where: { slug: FIXTURE_SLUG } });
  await prisma.book.create({
    data: {
      ...book,
      palette: book.palette === null ? Prisma.DbNull : book.palette,
      slug: FIXTURE_SLUG,
      popularityRank: FIXTURE_RANK,
      displaySlot: null,
    },
  });
  return book;
}

export async function removeFixture(): Promise<void> {
  assertTestDatabase();
  await prisma.book.deleteMany({ where: { slug: FIXTURE_SLUG } });
}
