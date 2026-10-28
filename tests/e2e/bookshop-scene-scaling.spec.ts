// Spec: docs/specs/bookshop-scene-scaling.md, acceptance criteria 1-8 and 10.
// Criterion 9 (hotspots at 2400px and 4988px) is geometry only: src/components/bookshop/scenes/scenes.test.ts.
// Criterion 6, attribute half (no "1920px" in `sizes`): src/components/bookshop/scene-scaling.test.ts.
//
// Rules under test, in CSS px (no width cap):
//   shop scene width = min(viewport width − 32, (viewport height − 96) × W/H)
//   open-book stage  = min(viewport width,       (viewport height − 88) × W/H)   (--chrome is 5.5rem = 88px)
//
// Assumptions (recorded in the spec): 1rem = 16px in Chromium; "stage" is the <main> element of /books/*;
// the open-book page is measured on a fixture book, as in book-detail-open-book.spec.ts.
// Preconditions: as the other e2e specs (test database, reseeded here, one worker).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { OPEN_BOOK } from "../../src/components/book/openBook";
import { DEFAULT_SCENE, SCENES, type Scene } from "../../src/components/bookshop/scenes";
import { FIXTURE_SLUG, putFixture, removeFixture } from "./support/book-fixtures";
import { prisma, reseed } from "./support/db";

test.describe.configure({ mode: "serial" });

declare global {
  interface Window {
    __cls: number;
  }
}
interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}
type Box = { x: number; y: number; width: number; height: number };
type Viewport = { width: number; height: number };

const SIDE_PADDING = 32;
const SHOP_CHROME = 96;
const BOOK_CHROME = 88; // 5.5rem
const BOTTOM_PADDING = 32;

const sceneImg = (scene: Scene) => `img[srcset*="/bookshop/${scene.id}@"]`;
const urlOf = (scene: Scene) => (scene.id === DEFAULT_SCENE.id ? "/" : `/shops/${scene.id}`);
const ratioOf = (scene: Scene) => scene.artwork.size.width / scene.artwork.size.height;
const BOOK_RATIO = OPEN_BOOK.size.width / OPEN_BOOK.size.height;
const BOOK_IMG = 'img[src*="/book/open-book"], img[srcset*="/book/open-book"]';

const shopWidth = (scene: Scene, v: Viewport) => Math.min(v.width - SIDE_PADDING, (v.height - SHOP_CHROME) * ratioOf(scene));
const bookWidth = (v: Viewport) => Math.min(v.width, (v.height - BOOK_CHROME) * BOOK_RATIO);

const ULTRAWIDE: Viewport = { width: 3440, height: 1440 };
const QHD: Viewport = { width: 2560, height: 1440 };
const UHD5K: Viewport = { width: 5120, height: 2880 };

const LONG_TEXT = "The lantern swung gently as the porter climbed another dark staircase. ".repeat(300);
const LONG_TITLE = "Quiet".repeat(20); // 100 characters
const LONG_AUTHOR = `${"Imogen".repeat(16)}Test`; // 100 characters

test.beforeAll(async () => {
  reseed();
});

test.afterAll(async () => {
  await removeFixture();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- helpers

async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} has no layout box`);
  return box;
}

async function openShop(page: Page, scene: Scene, viewport: Viewport) {
  await page.setViewportSize(viewport);
  await page.goto(urlOf(scene));
  await expect(page.locator(sceneImg(scene))).toBeVisible();
}

async function noScroll(page: Page, what: string) {
  const m = await page.evaluate(() => {
    const root = document.documentElement;
    window.scrollTo(1_000_000, 1_000_000);
    const max = { x: window.scrollX, y: window.scrollY };
    window.scrollTo(0, 0);
    return { sh: root.scrollHeight, sw: root.scrollWidth, ih: window.innerHeight, iw: window.innerWidth, max };
  });
  expect(m.sh, `${what}: scrollHeight vs innerHeight`).toBeLessThanOrEqual(m.ih);
  expect(m.sw, `${what}: scrollWidth vs innerWidth`).toBeLessThanOrEqual(m.iw);
  expect(m.max, `${what}: page can be scrolled`).toEqual({ x: 0, y: 0 });
}

const insideViewport = (b: Box, v: Viewport) =>
  b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= v.width + 0.5 && b.y + b.height <= v.height + 0.5;

const inside = (inner: Box, outer: Box, tolerance = 1) =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.width <= outer.x + outer.width + tolerance &&
  inner.y + inner.height <= outer.y + outer.height + tolerance;

// ---------------------------------------------------------------- #1 #2 #3 shop width, no cap

test.describe("shop scene width has no cap", () => {
  const cases = [
    { n: 1, viewport: ULTRAWIDE, approx: 2408 },
    { n: 2, viewport: QHD, approx: 2408 },
    { n: 3, viewport: UHD5K, approx: 4988 },
  ];
  for (const { n, viewport, approx } of cases) {
    test(`#${n} at ${viewport.width}×${viewport.height} the scene is (height − 96) × W/H wide (about ${approx}px), centred, with no scroll`, async ({
      page,
    }) => {
      await openShop(page, DEFAULT_SCENE, viewport);
      const scene = await boxOf(page.locator(sceneImg(DEFAULT_SCENE)), "scene artwork");
      const expected = shopWidth(DEFAULT_SCENE, viewport);

      expect(Math.abs(expected - approx), "the spec's own number").toBeLessThanOrEqual(3);
      expect(Math.abs(scene.width - expected), `scene is ${scene.width.toFixed(1)}px wide, expected ${expected.toFixed(1)}`).toBeLessThanOrEqual(1);
      expect(Math.abs(scene.height - scene.width / ratioOf(DEFAULT_SCENE)), "height follows the artwork ratio").toBeLessThanOrEqual(1);
      expect(Math.abs(scene.x + scene.width / 2 - viewport.width / 2), "centred").toBeLessThanOrEqual(1);
      await noScroll(page, `${viewport.width}×${viewport.height}`);
    });
  }
});

// ---------------------------------------------------------------- #4 always fully visible

test.describe("the whole image is always visible", () => {
  const viewports: Viewport[] = [
    ULTRAWIDE,
    QHD,
    UHD5K,
    { width: 2560, height: 1080 },
    { width: 3840, height: 1080 },
    { width: 1920, height: 1200 },
    { width: 1920, height: 1080 },
    { width: 1100, height: 2000 },
    { width: 1366, height: 768 },
  ];
  for (const scene of SCENES) {
    for (const viewport of viewports) {
      test(`#4 ${urlOf(scene)} at ${viewport.width}×${viewport.height}: box inside the viewport, bottom + 32px fits, not cropped`, async ({
        page,
      }) => {
        await openShop(page, scene, viewport);
        const img = page.locator(sceneImg(scene));
        const box = await boxOf(img, "scene artwork");
        expect(insideViewport(box, viewport), `scene box ${JSON.stringify(box)}`).toBe(true);
        expect(box.y + box.height + BOTTOM_PADDING, "bottom edge + 32px").toBeLessThanOrEqual(viewport.height + 1);
        expect(await img.evaluate((el) => getComputedStyle(el).objectFit), "object-fit").not.toBe("cover");
        // Nothing is cropped: the scene box has the artwork's ratio and the image fills it.
        expect(Math.abs(box.width / box.height - ratioOf(scene)), "ratio").toBeLessThan(0.01);
        expect(Math.abs(box.width - shopWidth(scene, viewport)), "no cap, no extra limit").toBeLessThanOrEqual(1);
      });
    }
  }
});

// ---------------------------------------------------------------- #5 unchanged windows

test.describe("existing windows keep their widths", () => {
  for (const { viewport, width } of [
    { viewport: { width: 1920, height: 1080 }, width: 1763 },
    { viewport: { width: 1366, height: 768 }, width: 1204 },
    { viewport: { width: 1600, height: 700 }, width: 1082 },
  ]) {
    test(`#5 at ${viewport.width}×${viewport.height} the scene is ${width}px wide`, async ({ page }) => {
      await openShop(page, DEFAULT_SCENE, viewport);
      const box = await boxOf(page.locator(sceneImg(DEFAULT_SCENE)), "scene artwork");
      expect(Math.abs(box.width - width), `scene is ${box.width.toFixed(1)}px wide`).toBeLessThanOrEqual(1);
    });
  }
});

// ---------------------------------------------------------------- #6 file choice

test.describe("the browser asks for the largest file", () => {
  test("#6 at 3440×1440 with pixel density 1 the browser loads the 2752 file", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: ULTRAWIDE, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      await page.goto("/");
      const img = page.locator(sceneImg(DEFAULT_SCENE));
      await expect(img).toHaveJSProperty("complete", true);
      const src = await img.evaluate((el) => (el as HTMLImageElement).currentSrc);
      expect(new URL(src).pathname).toBe(`/bookshop/${DEFAULT_SCENE.id}@${DEFAULT_SCENE.artwork.version}-2752.webp`);
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------- #7 #8 open-book page

test.describe("open-book stage has no cap", () => {
  const stage = (page: Page) => page.locator("main").first();

  async function openBook(page: Page, viewport: Viewport, overrides: Parameters<typeof putFixture>[0] = {}) {
    const book = await putFixture(overrides);
    await page.setViewportSize(viewport);
    const response = await page.goto(`/books/${FIXTURE_SLUG}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator(BOOK_IMG).first()).toBeVisible();
    return book;
  }

  test("#7 at 3440×1440 the stage is (height − chrome) × ratio wide, centred, inside the viewport, larger than 1920px", async ({
    page,
  }) => {
    await openBook(page, ULTRAWIDE);
    const box = await boxOf(stage(page), "stage");
    const expected = bookWidth(ULTRAWIDE);

    expect(Math.abs(box.width - expected), `stage is ${box.width.toFixed(1)}px wide, expected ${expected.toFixed(1)}`).toBeLessThanOrEqual(1);
    expect(box.width, "larger than the old cap").toBeGreaterThan(1920);
    expect(Math.abs(box.x + box.width / 2 - ULTRAWIDE.width / 2), "centred").toBeLessThanOrEqual(1);
    expect(insideViewport(box, ULTRAWIDE), `stage box ${JSON.stringify(box)}`).toBe(true);
    expect(Math.abs(box.width / box.height - BOOK_RATIO), "aspect ratio equals OPEN_BOOK.size").toBeLessThan(0.005);
    await noScroll(page, "open book at 3440×1440");
  });

  test("#7 the book image follows the stage, and its browser-chosen file covers the larger box (sizes has no cap)", async ({
    page,
  }) => {
    await openBook(page, ULTRAWIDE);
    const img = await boxOf(page.locator(BOOK_IMG).first(), "book image");
    expect(img.width, "book image is larger than the old cap").toBeGreaterThan(1920);
    const src = await page.locator(BOOK_IMG).first().evaluate((el) => (el as HTMLImageElement).currentSrc);
    expect(new URL(src).pathname, "largest file at density 1").toMatch(/-2752\.webp$/);
  });

  test("#8 at 3440×1440 long text stays on its pages: the pane scrolls itself, nothing overflows or leaves the book", async ({
    page,
  }) => {
    const book = await openBook(page, ULTRAWIDE, { about: LONG_TEXT });
    await noScroll(page, "long text");
    const image = await boxOf(page.locator(BOOK_IMG).first(), "book image");
    const pane = page.getByRole("region", { name: new RegExp(book.title) });
    expect(inside(await boxOf(pane, "pane"), image), "pane inside the book").toBe(true);
    const m = await pane.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sh, "pane scrolls vertically").toBeGreaterThan(m.ch);
    expect(m.sw, "no horizontal overflow in the pane").toBeLessThanOrEqual(m.cw + 1);
  });

  test("#8 at 3440×1440 a 100-character title and author stay inside the book with no clipping", async ({ page }) => {
    const book = await openBook(page, ULTRAWIDE, { title: LONG_TITLE, author: LONG_AUTHOR, about: LONG_TEXT });
    await noScroll(page, "long title");
    const image = await boxOf(page.locator(BOOK_IMG).first(), "book image");
    const h1 = page.getByRole("heading", { level: 1 });
    for (const [what, locator] of [
      ["h1", h1],
      ["byline", page.getByText(`by ${LONG_AUTHOR}`, { exact: true })],
      ["tagline", page.getByText(book.tagline, { exact: true })],
      ["pane", page.getByRole("region", { name: new RegExp(LONG_TITLE) })],
    ] as const) {
      expect(inside(await boxOf(locator, what), image), `${what} inside the book image`).toBe(true);
    }
    // Clipping: the h1's content must not be wider than its box.
    const clip = await h1.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
    expect(clip.sw, "h1 horizontal clipping").toBeLessThanOrEqual(clip.cw + 1);
    expect(clip.sh, "h1 vertical clipping").toBeLessThanOrEqual(clip.ch + 1);
  });

  test("#8 at 3440×1440 body text is not smaller than at 1440×900 (it never shrinks as the book grows)", async ({ page }) => {
    await openBook(page, { width: 1440, height: 900 });
    const small = await page.locator("main p").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await page.setViewportSize(ULTRAWIDE);
    const large = await page.locator("main p").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(large).toBeGreaterThanOrEqual(small);
  });
});

// ---------------------------------------------------------------- #10 layout shift and ratios

test.describe("layout shift is still 0", () => {
  const observe = (page: Page) =>
    page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LayoutShiftEntry[]) {
          if (!entry.hadRecentInput) window.__cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

  for (const viewport of [ULTRAWIDE, UHD5K]) {
    test(`#10 the shop page at ${viewport.width}×${viewport.height} has CLS 0 and the artwork's ratio`, async ({ page }) => {
      await observe(page);
      await page.setViewportSize(viewport);
      await page.goto("/");
      const img = page.locator(sceneImg(DEFAULT_SCENE));
      await expect(img).toHaveJSProperty("complete", true);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.__cls)).toBe(0);
      const box = await boxOf(img, "scene artwork");
      expect(Math.abs(box.width / box.height - ratioOf(DEFAULT_SCENE))).toBeLessThan(0.005);
    });
  }

  test("#10 the open-book page at 3440×1440 has CLS 0 and OPEN_BOOK's ratio", async ({ page }) => {
    await putFixture();
    await observe(page);
    await page.setViewportSize(ULTRAWIDE);
    await page.goto(`/books/${FIXTURE_SLUG}`);
    const img = page.locator(BOOK_IMG).first();
    await expect(img).toHaveJSProperty("complete", true);
    await page.waitForTimeout(1000); // the entrance animation is opacity only
    expect(await page.evaluate(() => window.__cls)).toBe(0);
    const box = await boxOf(page.locator("main").first(), "stage");
    expect(Math.abs(box.width / box.height - BOOK_RATIO)).toBeLessThan(0.005);
  });
});
