// Spec: docs/specs/content-import.md — criteria #14 and #15 (the rendered halves; the seed half is in
// tests/integration/content-import.db.test.ts).
//
// Preconditions
// - The app server under test reads the same DATABASE_URL as this process, and that database's name contains "test".
// - The beforeAll reseeds the database with a fixture entry for Anathem (never the developer's real approved content)
//   and the afterAll reseeds placeholders only. This file names no content path or env var (criterion 16): it goes
//   through tests/support/content-import.ts.
// - The route renders per request, so the reseeded data shows up on the next page load.
import { expect, test } from "@playwright/test";
import { ANATHEM, ANATHEM_SCENE, ANATHEM_SLOT, removeContentFixtures, seedPlaceholdersOnly, seedWithContent } from "../support/content-import";
import { assertTestDatabase, placedBooks, prisma } from "./support/scenes";

const NOT_FOUND_HEADING = "We couldn't find that book.";
const SECTIONS = [
  { heading: "What it's about", text: ANATHEM.about },
  { heading: "Why people are reading it", text: ANATHEM.whyPopular },
  { heading: "Why it matters", text: ANATHEM.whyItMatters },
  { heading: "About the author", text: ANATHEM.authorBio },
] as const;

let replacedSlug = "";

test.beforeAll(async () => {
  assertTestDatabase();
  seedPlaceholdersOnly();
  const slotOne = (await placedBooks(ANATHEM_SCENE)).find((b) => b.slot === ANATHEM_SLOT);
  replacedSlug = slotOne?.slug ?? "";
  expect(replacedSlug, "precondition: abbey slot 1 holds a placeholder before the import").toMatch(/^abbey-placeholder-\d{2}$/);
  seedWithContent(ANATHEM);
});

test.afterAll(async () => {
  seedPlaceholdersOnly();
  removeContentFixtures();
  await prisma.$disconnect();
});

test.describe("#14 /books/anathem", () => {
  test("returns 200 and shows the title and the author", async ({ page }) => {
    const response = await page.goto("/books/anathem");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ANATHEM.title);
    await expect(page.getByText(`by ${ANATHEM.author}`, { exact: true })).toBeVisible();
  });

  test("shows the four sections, in order, with the imported text", async ({ page }) => {
    await page.goto("/books/anathem");
    const names: string[] = SECTIONS.map((s) => s.heading);
    const shown = (await page.getByRole("heading", { level: 2 }).allTextContents()).map((t) => t.trim()).filter((t) => names.includes(t));
    expect(shown).toEqual(names);
    for (const { heading, text } of SECTIONS) {
      await expect(page.getByText(text, { exact: true }), `${heading}: text`).toBeVisible();
    }
  });

  test("uses the imported summary as the meta description", async ({ page }) => {
    await page.goto("/books/anathem");
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toBe(ANATHEM.summary);
  });

  test("/shops/abbey has a link to /books/anathem, and the database places Anathem at slot 1", async ({ page }) => {
    const slotOne = (await placedBooks(ANATHEM_SCENE)).find((b) => b.slot === ANATHEM_SLOT);
    expect(slotOne?.slug).toBe("anathem");
    const response = await page.goto(`/shops/${ANATHEM_SCENE}`);
    expect(response?.status()).toBe(200);
    const link = page.locator('[data-bookshop-scene]').getByRole("link", { name: `${ANATHEM.title} by ${ANATHEM.author}`, exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", "/books/anathem");
  });
});

test.describe("#15 the replaced placeholder", () => {
  test("/books/<replaced placeholder> returns 404 with the not-found page", async ({ page }) => {
    const response = await page.goto(`/books/${replacedSlug}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOT_FOUND_HEADING);
  });

  test("/shops/abbey no longer links to the replaced placeholder", async ({ page }) => {
    await page.goto(`/shops/${ANATHEM_SCENE}`);
    await expect(page.locator(`a[href="/books/${replacedSlug}"]`)).toHaveCount(0);
  });
});
