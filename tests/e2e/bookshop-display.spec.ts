// Spec: docs/specs/bookshop-display.md
// Criteria covered here: #1 #4 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18 #19 #20 #22 #23 #24 #26 #27
// Not automated: #21 (manual calibration check by the tester).
//
// Preconditions
// - The app server under test reads the same DATABASE_URL as this process, and that
//   database's name contains "test". Tests reseed it and change Book.displaySlot.
// - The landing page is rendered per request. The state tests (#4 empty slot, #15
//   partial, #16 empty) change data between page loads.
// - #18 has a development half and a production half. Set E2E_PRODUCTION=1 when the
//   server is a production build (`next build && next start`).
// - BREAKPOINT below must match the spec: 840px (Resolved → Mobile breakpoint, revised).
//   If criterion 13 raises it again, update it here.
// - #26 treats the content box of the page's <main> element as "the page content area".
//
// This file runs serially because several tests change shared database state.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ARTWORK_SIZE, ARTWORK_VERSION, HOTSPOTS } from "../../src/components/bookshop/hotspots";
import {
  clearSlots,
  displayedBooks,
  prisma,
  reseed,
  restoreSlots,
  snapshotSlots,
  type DisplayRow,
} from "./support/db";

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

const SCENE_IMG = 'img[srcset*="/bookshop/scene@"]';
const SCENE_FILE_ROUTE = "**/bookshop/scene@*.webp";
const EMPTY_MESSAGE = "The display is being rearranged. Check back soon.";
const PUBLIC_BOOKSHOP = path.join(process.cwd(), "public", "bookshop");
const SERVED_PATH = new RegExp(`^/bookshop/scene@${ARTWORK_VERSION}-(1376|2064|2752)\\.webp$`);
const BREAKPOINT = 840;
const SCENE_MAX_WIDTH = 1920;

const VIEWPORTS = {
  1440: { width: 1440, height: 900 },
  1024: { width: 1024, height: 768 },
  768: { width: 768, height: 1024 },
  375: { width: 375, height: 812 },
} as const;

const viewportFor = (width: number) => ({ width, height: width < 1024 ? 1024 : 900 });

let books: DisplayRow[] = [];

test.beforeAll(async () => {
  reseed();
  books = await displayedBooks();
  expect(books, "precondition: the seed places 25 books").toHaveLength(25);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- helpers

const hotspotName = (b: DisplayRow) => `${b.title} by ${b.author}`;
const hotspot = (page: Page, b: DisplayRow) => page.getByRole("link", { name: hotspotName(b), exact: true });
const drawerButton = (page: Page) => page.getByRole("button", { name: /^All \d+ on display$/ });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Books on display" });
const bookLinks = (page: Page) => page.locator('a[href^="/books/"]');
/** The hover/focus label is decorative (aria-hidden) and shows the title and author. */
const label = (page: Page, b: DisplayRow) =>
  page.locator('[aria-hidden="true"]').filter({ hasText: b.title }).filter({ hasText: b.author }).first();

async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} has no layout box`);
  return box;
}

async function sceneBox(page: Page): Promise<Box> {
  return boxOf(page.locator(SCENE_IMG), "scene artwork");
}

function slotRect(scene: Box, slot: number): Box {
  const h = HOTSPOTS.find((x) => x.slot === slot);
  if (!h) throw new Error(`HOTSPOTS has no slot ${slot}`);
  return {
    x: scene.x + (scene.width * h.rect.left) / 100,
    y: scene.y + (scene.height * h.rect.top) / 100,
    width: (scene.width * h.rect.width) / 100,
    height: (scene.height * h.rect.height) / 100,
  };
}

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * WCAG 2.5.8 Target Size (Minimum): a target passes if it is at least 24×24, or if a
 * 24px-diameter circle centred on its bounding box intersects no other target and no
 * other undersized target's circle.
 */
function targetSizeFailures(targets: { name: string; box: Box }[]): string[] {
  const MIN = 24;
  const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const undersized = (b: Box) => b.width < MIN || b.height < MIN;
  const circleHitsRect = (c: { x: number; y: number }, b: Box) => {
    const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.width));
    const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.height));
    return dx * dx + dy * dy < (MIN / 2) ** 2;
  };

  const failures: string[] = [];
  for (const t of targets) {
    if (!undersized(t.box)) continue;
    const c = centre(t.box);
    const size = `${t.box.width.toFixed(1)}×${t.box.height.toFixed(1)}`;
    for (const o of targets) {
      if (o === t) continue;
      if (circleHitsRect(c, o.box)) {
        failures.push(`${t.name} (${size}): spacing circle intersects ${o.name}`);
      } else if (undersized(o.box)) {
        const oc = centre(o.box);
        if (Math.hypot(c.x - oc.x, c.y - oc.y) < MIN) {
          failures.push(`${t.name} (${size}): spacing circle intersects the circle of ${o.name}`);
        }
      }
    }
  }
  return failures;
}

/** The content box of <main>, which #26 treats as "the page content area". */
async function contentArea(page: Page): Promise<Box> {
  const main = page.locator("main");
  await expect(main, "precondition: the page has one <main> element").toHaveCount(1);
  return main.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const left = parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth);
    const right = parseFloat(s.paddingRight) + parseFloat(s.borderRightWidth);
    return { x: r.x + left, y: r.y, width: r.width - left - right, height: r.height };
  });
}

function expectInside(inner: Box, outer: Box, what: string, tolerance = 1): void {
  expect(inner.x, `${what}: left edge`).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.y, `${what}: top edge`).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.x + inner.width, `${what}: right edge`).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(inner.y + inner.height, `${what}: bottom edge`).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}

async function activeHref(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("href") ?? null);
}

async function tabTo(page: Page, href: string, maxPresses = 80): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if ((await activeHref(page)) === href) return;
  }
  throw new Error(`Tab never reached ${href}`);
}

async function settledIndicatorStyle(link: Locator) {
  await link.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return link.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      boxShadow: s.boxShadow,
      background: s.backgroundColor,
      border: `${s.borderStyle} ${s.borderWidth} ${s.borderColor}`,
    };
  });
}

const allZero = (cssTimeList: string) => cssTimeList.split(",").every((v) => parseFloat(v) === 0);

const htmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

async function withSlotsCleared(slots: number[] | "all", body: () => Promise<void>): Promise<void> {
  const snapshot = await snapshotSlots();
  try {
    await clearSlots(slots);
    await body();
  } finally {
    await restoreSlots(snapshot);
  }
}

/** Scrolls a slot's centre to the middle of the viewport and returns what is hit there. */
async function interactiveElementAtSlot(page: Page, slot: number): Promise<string | null> {
  const before = slotRect(await sceneBox(page), slot);
  await page.evaluate((y) => window.scrollBy(0, y - window.innerHeight / 2), before.y + before.height / 2);
  const r = slotRect(await sceneBox(page), slot);
  return page.evaluate(
    ([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      if (!hit) return "nothing at point (outside viewport?)";
      const interactive = hit.closest('a, button, [role="button"], [role="link"], [tabindex]');
      return interactive ? interactive.outerHTML.slice(0, 200) : null;
    },
    [r.x + r.width / 2, r.y + r.height / 2] as const,
  );
}

// ---------------------------------------------------------------- without client JS

test.describe("without client JS", () => {
  test.use({ javaScriptEnabled: false, viewport: VIEWPORTS[1440] });

  test("#1 server HTML has one link per display book with /books/{slug} and name '{title} by {author}'", async ({
    page,
  }) => {
    await page.goto("/");
    for (const b of books) {
      const link = hotspot(page, b);
      await expect(link, hotspotName(b)).toHaveCount(1);
      await expect(link).toHaveAttribute("href", `/books/${b.slug}`);
    }
  });

  test("#22 the drawer button opens the sidebar and its links reach the detail pages", async ({ page }) => {
    await page.goto("/");
    await drawerButton(page).click();
    const nav = sidebar(page);
    await expect(nav).toBeVisible();

    await nav.getByRole("link").first().click();

    await expect(page).toHaveURL(new RegExp(`/books/${books[0].slug}$`));
  });
});

// ---------------------------------------------------------------- scene and hotspots

test.describe("scene at desktop width", () => {
  test.use({ viewport: VIEWPORTS[1440] });

  test("#4 each book's hotspot sits on the rectangle for its slot", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    const scene = await sceneBox(page);

    for (const b of books) {
      const box = await boxOf(hotspot(page, b), hotspotName(b));
      const expected = slotRect(scene, b.slot);
      const what = `slot ${b.slot} (${b.title})`;
      expect(Math.abs(box.x - expected.x), `${what} x`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(box.y - expected.y), `${what} y`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(box.width - expected.width), `${what} width`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(box.height - expected.height), `${what} height`).toBeLessThanOrEqual(1.5);
    }
  });

  test("#4 a slot with no book renders no interactive element", async ({ page }) => {
    const emptied = books.slice(0, 3);
    await withSlotsCleared(
      emptied.map((b) => b.slot),
      async () => {
        await page.goto("/");
        await expect(page.locator(SCENE_IMG)).toBeVisible();
        for (const b of emptied) await expect(hotspot(page, b)).toHaveCount(0);
        for (const b of emptied) {
          expect(await interactiveElementAtSlot(page, b.slot), `empty slot ${b.slot}`).toBeNull();
        }
      },
    );
  });

  test("#6 hovering a hotspot shows its title and author; moving off hides the label", async ({ page }) => {
    await page.goto("/");
    for (const b of books) {
      await hotspot(page, b).hover();
      await expect(label(page, b), `label for ${b.title}`).toBeVisible();

      await page.mouse.move(0, 0);
      await expect(label(page, b), `label for ${b.title} after leaving`).toBeHidden();
    }
  });

  test("#7 tabbing to a hotspot shows the label and a focus indicator distinct from hover", async ({ page }) => {
    await page.goto("/");
    const b = books[0];
    const link = hotspot(page, b);

    const resting = await settledIndicatorStyle(link);
    await link.hover();
    const hovered = await settledIndicatorStyle(link);
    await page.mouse.move(0, 0);

    await tabTo(page, `/books/${b.slug}`);
    await expect(link).toBeFocused();
    await expect(label(page, b)).toBeVisible();
    const focused = await settledIndicatorStyle(link);

    expect(focused, "focus indicator differs from the resting style").not.toEqual(resting);
    expect(focused, "focus indicator differs from the hover style").not.toEqual(hovered);
  });

  test("#9 clicking a hotspot opens that book's detail page", async ({ page }) => {
    const b = books[0];
    await page.goto("/");
    await hotspot(page, b).click();
    await expect(page).toHaveURL(new RegExp(`/books/${b.slug}$`));
  });

  test("#9 pressing Enter on a focused hotspot opens that book's detail page", async ({ page }) => {
    const b = books[books.length - 1];
    await page.goto("/");
    await hotspot(page, b).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/books/${b.slug}$`));
  });

  test("#10 Tab visits the hotspots in slot order 1→25", async ({ page }) => {
    await page.goto("/");
    const visited: string[] = [];
    for (let i = 0; i < 120 && visited.length < books.length; i++) {
      await page.keyboard.press("Tab");
      const href = await activeHref(page);
      if (href?.startsWith("/books/")) visited.push(href);
    }
    expect(visited).toEqual(books.map((b) => `/books/${b.slug}`));
  });

  test("#11 the artwork is one of the committed lossless WebPs, byte for byte, rendered smoothly", async ({ page }) => {
    const sceneResponse = page.waitForResponse((r) => new URL(r.url()).pathname.startsWith("/bookshop/scene@"));
    await page.goto("/");
    const img = page.locator(SCENE_IMG);
    await expect(img).toBeVisible();
    await expect(img).toHaveJSProperty("complete", true);

    const src = new URL(await img.evaluate((el) => (el as HTMLImageElement).currentSrc)).pathname;
    expect(src, "currentSrc is one of the three served files").toMatch(SERVED_PATH);

    const response = await sceneResponse;
    expect(new URL(response.url()).pathname, "the file the browser fetched is the one it shows").toBe(src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/webp");
    const committed = readFileSync(path.join(PUBLIC_BOOKSHOP, path.basename(src)));
    expect((await response.body()).equals(committed), "served bytes equal the committed file").toBe(true);

    expect(await img.evaluate((el) => getComputedStyle(el).imageRendering)).toBe("auto");
  });

  test("#12 the scene holds the artwork's aspect ratio before the image loads", async ({ page }) => {
    await page.route(SCENE_FILE_ROUTE, () => {
      // Never answer: the image stays pending for the whole test.
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const box = await sceneBox(page);
    expect(box.width / box.height).toBeCloseTo(ARTWORK_SIZE.width / ARTWORK_SIZE.height, 2);
  });

  test("#12 loading the artwork causes no layout shift", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The Layout Instability API is Chromium-only");
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LayoutShiftEntry[]) {
          if (!entry.hadRecentInput) window.__cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/");
    const img = page.locator(SCENE_IMG);
    await expect(img).toHaveJSProperty("complete", true);
    // naturalWidth is density-corrected for w-descriptor candidates, so check the chosen file instead.
    const src = new URL(await img.evaluate((el) => (el as HTMLImageElement).currentSrc)).pathname;
    expect(src, "precondition: the artwork loaded from a served file").toMatch(SERVED_PATH);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    expect(await page.evaluate(() => window.__cls)).toBe(0);
  });

  test("#15 the sidebar lists the same books, in the same order, with the same links", async ({ page }) => {
    await page.goto("/");
    await expect(drawerButton(page)).toHaveText(`All ${books.length} on display`);
    await drawerButton(page).click();

    const hrefs = await sidebar(page)
      .getByRole("link")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(hrefs).toEqual(books.map((b) => `/books/${b.slug}`));
  });

  test("#15 with 18 books on display, the button, hotspots and sidebar show only those 18", async ({ page }) => {
    const removed = books.slice(0, 7);
    const remaining = books.slice(7);
    await withSlotsCleared(
      removed.map((b) => b.slot),
      async () => {
        await page.goto("/");
        await expect(drawerButton(page)).toHaveText("All 18 on display");
        for (const b of remaining) await expect(hotspot(page, b)).toHaveCount(1);
        for (const b of removed) await expect(hotspot(page, b)).toHaveCount(0);

        await drawerButton(page).click();
        const hrefs = await sidebar(page)
          .getByRole("link")
          .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
        expect(hrefs).toEqual(remaining.map((b) => `/books/${b.slug}`));
      },
    );
  });

  test("#16 with no books on display: empty-state message, no hotspots, no drawer button", async ({ page }) => {
    await withSlotsCleared("all", async () => {
      await page.goto("/");
      await expect(page.getByText(EMPTY_MESSAGE)).toBeVisible();
      await expect(bookLinks(page)).toHaveCount(0);
      await expect(drawerButton(page)).toHaveCount(0);
    });
  });

  test("#17 if the artwork fails to load, hotspots hide and the sidebar still works", async ({ page }) => {
    await page.route(SCENE_FILE_ROUTE, (route) => route.abort());
    await page.goto("/");

    for (const link of await bookLinks(page).all()) await expect(link).toBeHidden();

    await drawerButton(page).click();
    const nav = sidebar(page);
    await expect(nav).toBeVisible();
    for (const b of books) await expect(nav.locator(`a[href="/books/${b.slug}"]`)).toBeVisible();
  });

  test("#18 (development) /?hotspots=1 labels all 25 slot rectangles with their numbers", async ({ page }) => {
    test.skip(process.env.E2E_PRODUCTION === "1", "development-only behaviour");
    await page.goto("/?hotspots=1");
    for (let n = 1; n <= 25; n++) {
      await expect(page.getByText(String(n), { exact: true }).first(), `slot ${n} label`).toBeVisible();
    }
  });

  for (const url of ["/", "/?hotspots=yes"]) {
    test(`#18 ${url} shows no calibration overlay`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator(SCENE_IMG)).toBeVisible();
      for (let n = 1; n <= 25; n++) {
        await expect(page.getByText(String(n), { exact: true }), `slot ${n} label`).toHaveCount(0);
      }
    });
  }

  test("#18 (production) /?hotspots=1 renders the normal page", async ({ page }) => {
    test.skip(process.env.E2E_PRODUCTION !== "1", "requires a production build; set E2E_PRODUCTION=1");
    await page.goto("/?hotspots=1");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    for (let n = 1; n <= 25; n++) {
      await expect(page.getByText(String(n), { exact: true }), `slot ${n} label`).toHaveCount(0);
    }
  });

  test("#19 the landing page response contains no long-form copy or affiliate links", async ({ page }) => {
    const html = await (await page.request.get("/")).text();
    const longForm = await prisma.book.findMany({
      where: { displaySlot: { not: null } },
      select: { about: true, whyPopular: true, whyItMatters: true, affiliateUrl: true },
    });

    for (const row of longForm) {
      for (const [field, value] of Object.entries(row)) {
        if (value.length === 0) continue;
        expect(html, `${field}: "${value}"`).not.toContain(value);
        expect(html, `${field} (HTML-escaped)`).not.toContain(htmlEscape(value));
      }
    }
  });

  test("#23 Enter on the drawer button opens the sidebar and focus stays on the button", async ({ page }) => {
    await page.goto("/");
    const button = drawerButton(page);
    await button.focus();
    await page.keyboard.press("Enter");

    await expect(sidebar(page)).toBeVisible();
    await expect(button).toBeFocused();
  });

  test("#23 after opening, Tab focuses the close button and then the first link", async ({ page }) => {
    await page.goto("/");
    await drawerButton(page).focus();
    await page.keyboard.press("Enter");
    const nav = sidebar(page);
    await expect(nav).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(nav.getByRole("button"), "close button").toBeFocused();

    await page.keyboard.press("Tab");
    const first = nav.getByRole("link").first();
    await expect(first, "first sidebar link").toBeFocused();
    await expect(first).toHaveAttribute("href", `/books/${books[0].slug}`);
  });

  test("#23 with focus inside the sidebar, Escape closes it and focus returns to the drawer button", async ({
    page,
  }) => {
    await page.goto("/");
    const button = drawerButton(page);
    await button.focus();
    await page.keyboard.press("Enter");
    const nav = sidebar(page);
    await expect(nav).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect.poll(() => nav.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");

    await expect(nav).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("#23 with focus inside the sidebar, activating the close button closes it and focus returns to the drawer button", async ({
    page,
  }) => {
    await page.goto("/");
    const button = drawerButton(page);
    await button.focus();
    await page.keyboard.press("Enter");
    const nav = sidebar(page);
    await expect(nav).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("button"), "close button").toBeFocused();

    await page.keyboard.press("Enter");

    await expect(nav).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("#23 clicking outside the open sidebar closes it", async ({ page }) => {
    await page.goto("/");
    await drawerButton(page).focus();
    await page.keyboard.press("Enter");
    const nav = sidebar(page);
    await expect(nav).toBeVisible();

    await page.mouse.click(1, 1);

    await expect(nav).toBeHidden();
  });

  test("#23 clicking a focusable element outside the sidebar leaves focus on it, not the drawer button", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === "webkit", "WebKit does not focus links on mouse click (spec Risks: Safari focus gap)");
    await page.goto("/");
    // The leftmost book is furthest from the right-hand sidebar.
    const leftOf = (b: DisplayRow) => HOTSPOTS.find((h) => h.slot === b.slot)?.rect.left ?? Infinity;
    const target = [...books].sort((a, b) => leftOf(a) - leftOf(b))[0];

    const button = drawerButton(page);
    await button.focus();
    await page.keyboard.press("Enter");
    const nav = sidebar(page);
    await expect(nav).toBeVisible();

    // Keep the page on "/" so focus can be inspected after the click. Installed only now:
    // Enter on the drawer button dispatches a click, and cancelling it would stop the popover opening.
    await page.evaluate(() => document.addEventListener("click", (e) => e.preventDefault(), { capture: true }));
    await hotspot(page, target).click();

    await expect(nav).toBeHidden();
    await expect(hotspot(page, target)).toBeFocused();
    await expect(button).not.toBeFocused();
  });
});

test.describe("label stays inside the scene", () => {
  for (const width of [1440, 1024, BREAKPOINT]) {
    test(`#8 at ${width}px the label stays within the scene for every hotspot (hover and focus)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewportFor(width));
      await page.goto("/");
      for (const b of books) {
        const link = hotspot(page, b);

        await link.hover();
        await expect(label(page, b)).toBeVisible();
        expectInside(await boxOf(label(page, b), "label"), await sceneBox(page), `hover slot ${b.slot}`);
        await page.mouse.move(0, 0);

        await link.focus();
        await expect(label(page, b)).toBeVisible();
        expectInside(await boxOf(label(page, b), "label"), await sceneBox(page), `focus slot ${b.slot}`);
        await link.blur();
      }
    });
  }
});

test.describe("touch-target size", () => {
  // Hotspots scale with the scene, so the breakpoint width is the hardest case. The wider
  // widths sample "every viewport width at or above the breakpoint".
  for (const width of [BREAKPOINT, 1024, 1280, 1440, SCENE_MAX_WIDTH]) {
    test(`#13 at ${width}px every hotspot meets WCAG 2.5.8 (24×24 or the 24px spacing exception)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewportFor(width));
      await page.goto("/");
      await expect(page.locator(SCENE_IMG)).toBeVisible();
      const targets: { name: string; box: Box }[] = [];
      for (const b of books) {
        targets.push({ name: `slot ${b.slot}`, box: await boxOf(hotspot(page, b), hotspotName(b)) });
      }
      expect(targetSizeFailures(targets)).toEqual([]);
    });
  }
});

test.describe("below the breakpoint", () => {
  for (const width of [375, BREAKPOINT - 1]) {
    test(`#14 at ${width}px hotspots are out of the accessibility tree, not focusable and not clickable`, async ({
      page,
    }) => {
      await page.setViewportSize(viewportFor(width));
      await page.goto("/");
      await expect(page.locator(SCENE_IMG)).toBeVisible();

      for (const b of books) await expect(hotspot(page, b), hotspotName(b)).toHaveCount(0);

      for (let i = 0; i < 60; i++) {
        await page.keyboard.press("Tab");
        // activeHref is null when focus is on the body or the drawer button.
        expect((await activeHref(page)) ?? "", "no /books/ link takes focus while the sidebar is closed").not.toMatch(
          /^\/books\//,
        );
      }

      for (const link of await bookLinks(page).all()) {
        if (await link.isVisible()) {
          expect(await link.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
        }
      }
    });
  }

  test("#14 at 375px the drawer button is visible and every display book is reachable in the sidebar", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS[375]);
    await page.goto("/");
    await expect(drawerButton(page)).toBeVisible();
    await drawerButton(page).click();
    const nav = sidebar(page);
    await expect(nav).toBeVisible();
    for (const b of books) await expect(nav.locator(`a[href="/books/${b.slug}"]`)).toBeVisible();
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: VIEWPORTS[1440], reducedMotion: "reduce" });

  test("#20 hotspot hover and focus highlights have no transition", async ({ page }) => {
    await page.goto("/");
    const link = hotspot(page, books[0]);
    const timings = (el: Element) => {
      const s = getComputedStyle(el);
      return { transition: s.transitionDuration, animation: s.animationDuration };
    };

    await link.hover();
    const onHover = await link.evaluate(timings);
    await page.mouse.move(0, 0);
    await link.focus();
    const onFocus = await link.evaluate(timings);

    for (const [state, t] of [
      ["hover", onHover],
      ["focus", onFocus],
    ] as const) {
      expect(allZero(t.transition), `${state} transition-duration ${t.transition}`).toBe(true);
      expect(allZero(t.animation), `${state} animation-duration ${t.animation}`).toBe(true);
    }
  });

  test("#20 the sidebar appears with no slide-in transition", async ({ page }) => {
    await page.goto("/");
    await drawerButton(page).click();
    const nav = sidebar(page);
    await expect(nav).toBeVisible();
    const t = await nav.evaluate((el) => {
      const s = getComputedStyle(el);
      return { transition: s.transitionDuration, animation: s.animationDuration };
    });
    expect(allZero(t.transition), `transition-duration ${t.transition}`).toBe(true);
    expect(allZero(t.animation), `animation-duration ${t.animation}`).toBe(true);
  });
});

test.describe("drawer button placement", () => {
  for (const width of [1440, 1024, 768, 375] as const) {
    test(`#24 at ${width}px the drawer button does not overlap the scene`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[width]);
      await page.goto("/");
      await expect(page.locator(SCENE_IMG)).toBeVisible();
      const button = await boxOf(drawerButton(page), "drawer button");
      const scene = await sceneBox(page);

      expect(intersects(button, scene), `button ${JSON.stringify(button)} vs scene ${JSON.stringify(scene)}`).toBe(
        false,
      );
    });
  }
});

test.describe("scene scales to fit", () => {
  const ratio = ARTWORK_SIZE.height / ARTWORK_SIZE.width;

  for (const width of [375, 768, 1024, 1440] as const) {
    test(`#26 at ${width}px the scene fills the content area width with no horizontal scrollbar`, async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORTS[width]);
      await page.goto("/");
      await expect(page.locator(SCENE_IMG)).toBeVisible();
      const scene = await sceneBox(page);
      const content = await contentArea(page);

      expect(Math.abs(scene.width - content.width), `scene ${scene.width} vs content ${content.width}`).toBeLessThanOrEqual(1);
      expect(Math.abs(scene.x - content.x), "scene left edge vs content left edge").toBeLessThanOrEqual(1);
      expect(Math.abs(scene.height - scene.width * ratio), "height follows 2752:1536").toBeLessThanOrEqual(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
    });
  }

  test("#26 at 2560px the scene is 1920px wide and centred", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    const scene = await sceneBox(page);
    const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(Math.abs(scene.width - SCENE_MAX_WIDTH), `scene width ${scene.width}`).toBeLessThanOrEqual(1);
    expect(Math.abs(scene.height - SCENE_MAX_WIDTH * ratio), "height follows 2752:1536").toBeLessThanOrEqual(1);
    expect(Math.abs(scene.x + scene.width / 2 - pageWidth / 2), "scene centre vs page centre").toBeLessThanOrEqual(1);
  });
});

test.describe("responsive image selection", () => {
  const cases = [
    { width: 375, height: 812, dpr: 2, file: 1376 },
    { width: 1440, height: 900, dpr: 1, file: 2064 },
    { width: 1440, height: 900, dpr: 2, file: 2752 },
  ] as const;

  for (const c of cases) {
    test(`#27 at ${c.width}px with pixel density ${c.dpr} the browser loads scene@${ARTWORK_VERSION}-${c.file}.webp`, async ({
      browser,
      baseURL,
    }) => {
      // A fresh context per case, so no cached candidate influences the choice.
      const context = await browser.newContext({
        baseURL,
        viewport: { width: c.width, height: c.height },
        deviceScaleFactor: c.dpr,
      });
      try {
        const page = await context.newPage();
        await page.goto("/");
        const img = page.locator(SCENE_IMG);
        await expect(img).toHaveJSProperty("complete", true);
        const src = await img.evaluate((el) => (el as HTMLImageElement).currentSrc);
        expect(new URL(src).pathname).toBe(`/bookshop/scene@${ARTWORK_VERSION}-${c.file}.webp`);
      } finally {
        await context.close();
      }
    });
  }
});
