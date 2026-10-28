// Spec: docs/specs/bookshop-display.md → "Scales to fit the window, so the page never scrolls" and "Narrow scenes"
// Criteria covered here: #36 #37 #38, the short-window half of #13 and #14, and the `sizes` rule that #27 relies on.
// Criteria 13, 14 and 26 for width-limited windows are still covered by tests/e2e/bookshop-display.spec.ts.
//
// The rule under test, in CSS px:
//   scene width = min(viewport width − 32, (viewport height − 96) × 2752/1536)
// (no 1920px cap: see docs/specs/bookshop-scene-scaling.md)
// where 96 = the 64px toolbar row + the 32px bottom padding. The hotspots show only while the scene is at
// least 808px wide (840 − 2×16), measured on the scene, not on the viewport.
//
// Preconditions are the same as the other e2e specs: the server reads a database whose name contains
// "test", and this file reseeds it. The config runs a single worker, so tests never overlap.
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_SCENE } from "../../src/components/bookshop/scenes";
import { placedBooks, prisma, reseed } from "./support/scenes";
import type { DisplayRow } from "./support/db";
import { intersects, targetSizeFailures, type Box } from "./support/target-size";

type Viewport = { width: number; height: number };

const SCENE = "[data-bookshop-scene]";
const { size: ARTWORK_SIZE, version: ARTWORK_VERSION } = DEFAULT_SCENE.artwork;
const SCENE_IMG = `img[srcset*="/bookshop/${DEFAULT_SCENE.id}@"]`;
const EDGE = "[data-hotspot-edge]";
const FOCUS_SVG = "[data-hotspot-focus]";

const RATIO = ARTWORK_SIZE.width / ARTWORK_SIZE.height; // 2752:1536
const SIDE_PADDING = 32; // 16px on each side
const CHROME = 96; // 64px toolbar row + 32px bottom padding
const BOTTOM_PADDING = 32;
const SCENE_MAX_WIDTH = 1920;
const MIN_SCENE_FOR_HOTSPOTS = 808; // the 840px breakpoint, measured on the scene

/** The spec's formula. */
const expectedSceneWidth = (v: Viewport) => Math.min(v.width - SIDE_PADDING, (v.height - CHROME) * RATIO, SCENE_MAX_WIDTH);

/** The viewports listed in criterion 36. */
const NO_SCROLL_VIEWPORTS: Viewport[] = [
  { width: 375, height: 812 },
  { width: 812, height: 375 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 700 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

let books: DisplayRow[] = [];

test.beforeAll(async () => {
  reseed();
  books = await placedBooks(DEFAULT_SCENE.id);
  expect(books, "precondition: the seed places 25 books").toHaveLength(25);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- helpers

const label = (v: Viewport) => `${v.width}×${v.height}`;
const drawerButton = (page: Page) => page.getByRole("button", { name: /^All \d+ on display$/ });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Books on display" });
/** Hotspot links as the accessibility tree sees them: hidden hotspots are not returned. */
const sceneLinks = (page: Page) => page.locator(SCENE).getByRole("link");

async function boxOf(locator: ReturnType<Page["locator"]>, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} has no layout box`);
  return box;
}

const sceneBox = (page: Page) => boxOf(page.locator(SCENE_IMG), "scene artwork");

async function open(page: Page, viewport: Viewport): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.locator(SCENE_IMG)).toBeVisible();
}

/** How far the page can scroll, measured two ways: the spec's scrollHeight/scrollWidth and an actual scroll attempt. */
async function scrollMetrics(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const before = { x: window.scrollX, y: window.scrollY };
    window.scrollTo(1_000_000, 1_000_000);
    const maxScroll = { x: window.scrollX, y: window.scrollY };
    window.scrollTo(before.x, before.y);
    return {
      scrollHeight: root.scrollHeight,
      scrollWidth: root.scrollWidth,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      maxScroll,
    };
  });
}

async function expectNeverScrolls(page: Page, what: string): Promise<void> {
  const m = await scrollMetrics(page);
  expect(m.scrollHeight, `${what}: scrollHeight vs innerHeight ${m.innerHeight}`).toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth, `${what}: scrollWidth vs innerWidth ${m.innerWidth}`).toBeLessThanOrEqual(m.innerWidth);
  expect(m.maxScroll, `${what}: the page can be scrolled by ${JSON.stringify(m.maxScroll)} px`).toEqual({ x: 0, y: 0 });
  const scene = await sceneBox(page);
  expect(
    scene.y + scene.height + BOTTOM_PADDING,
    `${what}: scene bottom ${(scene.y + scene.height).toFixed(1)} + ${BOTTOM_PADDING}px vs viewport height ${m.innerHeight}`,
  ).toBeLessThanOrEqual(m.innerHeight + 1);
}

function expectSceneWidth(scene: Box, viewport: Viewport, what: string): void {
  const expected = expectedSceneWidth(viewport);
  expect(Math.abs(scene.width - expected), `${what}: scene is ${scene.width.toFixed(1)}px wide, expected ${expected.toFixed(1)}px`).toBeLessThanOrEqual(1);
  expect(Math.abs(scene.height - scene.width / RATIO), `${what}: height follows 2752:1536`).toBeLessThanOrEqual(1);
}

// ---------------------------------------------------------------- #36 the page never scrolls

test.describe("the page never scrolls", () => {
  for (const viewport of NO_SCROLL_VIEWPORTS) {
    test(`#36 at ${label(viewport)} there is no vertical or horizontal scroll`, async ({ page }) => {
      await open(page, viewport);
      await expectNeverScrolls(page, label(viewport));
    });
  }

  test("#36 after resizing from 1440×900 to 1600×700 without a reload, the page still does not scroll", async ({ page }) => {
    await open(page, { width: 1440, height: 900 });
    await expectNeverScrolls(page, "before the resize");

    await page.setViewportSize({ width: 1600, height: 700 });

    await expect
      .poll(async () => (await sceneBox(page)).width, { message: "scene width follows the new window height" })
      .toBeLessThan(1100);
    await expectNeverScrolls(page, "after the resize");
  });
});

// ---------------------------------------------------------------- #37 the scene fills the window

test.describe("the scene fills the window", () => {
  // The first three are the exact numbers in criterion 37.
  const specNumbers: { viewport: Viewport; width: number }[] = [
    { viewport: { width: 1920, height: 1080 }, width: 1763 },
    { viewport: { width: 1366, height: 768 }, width: 1204 },
    { viewport: { width: 1600, height: 700 }, width: 1082 },
  ];

  for (const { viewport, width } of specNumbers) {
    test(`#37 at ${label(viewport)} the scene is ${width}px wide`, async ({ page }) => {
      await open(page, viewport);
      const scene = await sceneBox(page);
      expect(Math.abs(scene.width - width), `scene is ${scene.width.toFixed(1)}px wide`).toBeLessThanOrEqual(1);
    });
  }

  // The same rule at more windows: height-limited and width-limited (no cap; the wide ones are in bookshop-scene-scaling.spec.ts).
  const more: Viewport[] = [
    { width: 1280, height: 720 },
    { width: 1024, height: 768 }, // width-limited
    { width: 1440, height: 900 }, // width-limited, only just
    { width: 1952, height: 1100 }, // height-limited, 1799px
    { width: 1952, height: 1200 }, // width-limited at 1920px (not a cap)
    { width: 812, height: 375 }, // landscape phone
  ];

  for (const viewport of [...specNumbers.map((s) => s.viewport), ...more]) {
    test(`#37 at ${label(viewport)} the scene is centred, follows the ratio and the toolbar does not overlap it`, async ({
      page,
    }) => {
      await open(page, viewport);
      const scene = await sceneBox(page);
      const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);

      expectSceneWidth(scene, viewport, label(viewport));
      expect(Math.abs(scene.x + scene.width / 2 - pageWidth / 2), "scene centre vs page centre").toBeLessThanOrEqual(1);
      const button = await boxOf(drawerButton(page), "drawer button");
      expect(intersects(button, scene), `button ${JSON.stringify(button)} vs scene ${JSON.stringify(scene)}`).toBe(false);
    });
  }
});

// ---------------------------------------------------------------- #27 the browser picks a file for the scene's real width

test.describe("responsive image selection follows the window height", () => {
  // UI Surface: the `sizes` value matches the scene's width rule, including its height limit.
  // At 1600×700 and pixel density 1 the scene is 1082px wide, so the 1376w file is the smallest that covers it.
  // A width-only rule (1568px) would pick the 2064w file.
  test(`#27 at 1600×700 with pixel density 1 the browser loads ${DEFAULT_SCENE.id}@${ARTWORK_VERSION}-1376.webp`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1600, height: 700 }, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      await page.goto("/");
      const img = page.locator(SCENE_IMG);
      await expect(img).toHaveJSProperty("complete", true);
      const src = await img.evaluate((el) => (el as HTMLImageElement).currentSrc);
      expect(new URL(src).pathname).toBe(`/bookshop/${DEFAULT_SCENE.id}@${ARTWORK_VERSION}-1376.webp`);
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------- #13 short, wide window

test.describe("touch-target size in a short, wide window", () => {
  test("#13 at 1600×700 the scene is height-limited and every hotspot meets WCAG 2.5.8", async ({ page }) => {
    const viewport = { width: 1600, height: 700 };
    await open(page, viewport);
    // Without this the test would pass today for the wrong reason: a 1568px scene is bigger than needed.
    expectSceneWidth(await sceneBox(page), viewport, label(viewport));

    const targets = [];
    for (const b of books) {
      const link = page.getByRole("link", { name: `${b.title} by ${b.author}`, exact: true });
      targets.push({ name: `slot ${b.slot}`, box: await boxOf(link, `slot ${b.slot}`) });
    }
    expect(targetSizeFailures(targets)).toEqual([]);
  });
});

// ---------------------------------------------------------------- #38 and #14: narrow scenes are decorative

test.describe("narrow scenes", () => {
  test("#38 at 1600×500 the scene is about 724px wide and its hotspots, edges and rings are hidden", async ({ page }) => {
    const viewport = { width: 1600, height: 500 };
    await open(page, viewport);
    const scene = await sceneBox(page);
    expectSceneWidth(scene, viewport, label(viewport));
    expect(scene.width, "the scene is narrower than 808px").toBeLessThan(MIN_SCENE_FOR_HOTSPOTS);

    await expect(sceneLinks(page), "no hotspot is in the accessibility tree").toHaveCount(0);
    for (const selector of [EDGE, FOCUS_SVG]) {
      const displays = await page.locator(selector).evaluateAll((els) => els.map((el) => getComputedStyle(el).display));
      expect(displays.length, `${selector} elements exist in the markup`).toBe(25);
      expect(new Set(displays), `${selector}: computed display of every element`).toEqual(new Set(["none"]));
    }
    await expectNeverScrolls(page, label(viewport));
  });

  test("#38 at 1600×500 no book takes focus or a click, while the sidebar still lists all 25", async ({ page }) => {
    await open(page, { width: 1600, height: 500 });

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const href = await page.evaluate(() => document.activeElement?.getAttribute("href") ?? "");
      expect(href, "no /books/ link takes focus while the sidebar is closed").not.toMatch(/^\/books\//);
    }
    const clickable = await page.evaluate(
      () => [...document.querySelectorAll('[data-bookshop-scene] a[href^="/books/"]')].filter((el) => {
        const s = getComputedStyle(el);
        return s.display !== "none" && s.pointerEvents !== "none" && s.visibility !== "hidden";
      }).length,
    );
    expect(clickable, "hotspot links that could still be clicked").toBe(0);

    await expect(drawerButton(page)).toBeVisible();
    await drawerButton(page).click();
    const nav = sidebar(page);
    await expect(nav).toBeVisible();
    for (const b of books) await expect(nav.locator(`a[href="/books/${b.slug}"]`), `slot ${b.slot}`).toBeVisible();
  });

  test("#38 at 1600×560 the scene is about 831px wide and its hotspots and edges are shown", async ({ page }) => {
    const viewport = { width: 1600, height: 560 };
    await open(page, viewport);
    const scene = await sceneBox(page);
    expectSceneWidth(scene, viewport, label(viewport));
    expect(scene.width, "the scene is at least 808px wide").toBeGreaterThanOrEqual(MIN_SCENE_FOR_HOTSPOTS);

    await expect(sceneLinks(page), "25 hotspots are in the accessibility tree").toHaveCount(25);
    const displays = await page.locator(EDGE).evaluateAll((els) => els.map((el) => getComputedStyle(el).display));
    expect(displays, "an edge is drawn for every book").toHaveLength(25);
    expect(displays.filter((d) => d === "none"), "edges that are hidden").toEqual([]);
    await expectNeverScrolls(page, label(viewport));
  });

  // The decision is about the scene's width, not the viewport's: the same 1600px-wide window flips with its height.
  test("#14 the same 1600px-wide window shows the hotspots at 700px high and hides them at 500px high", async ({ page }) => {
    await open(page, { width: 1600, height: 700 });
    await expect(sceneLinks(page)).toHaveCount(25);

    await page.setViewportSize({ width: 1600, height: 500 });

    await expect(sceneLinks(page), "hotspots hide when the window gets shorter, with no reload").toHaveCount(0);
  });
});
