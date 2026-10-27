// Spec: docs/specs/multiple-bookshop-scenes.md
// Criteria covered here: #13 #14 #15 #16 #17 #18 #19 #20 #21 #22 #23 #24 #25 and, for every scene, the carried-over
// behaviour of #27 (hit area, hover, focus ring, edge markup, Tab order, label clamp).
// Not automated: #26 (the tester's manual calibration of every edge against its book). #20's "with one scene there
// is no nav" half cannot be reached: the registry is fixed at two scenes, and the spec names no test seam.
// The "no placement query" half of #16 is checked indirectly (see that test).
//
// Preconditions, as in the other e2e specs
// - The app server reads the same DATABASE_URL as this process, and its name contains "test". This file reseeds it.
// - Set E2E_PRODUCTION=1 when the server is a production build; #17 has a development and a production half.
// - Module path for the registry assumed as in src/components/bookshop/scenes/scenes.test.ts.
// - MIN_SCENE_FOR_HOTSPOTS is the spec's 808px. Criterion 25 says it rises if a scene fails the target-size rule at
//   808px; if the architect raises it, change the one constant.
// - The toolbar (#21) is taken to be the closest common ancestor of the switcher and the drawer button.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEFAULT_SCENE_ID, SCENES } from "../../src/components/bookshop/scenes";
import { parseClipPath, parsePoints, pickPoints, pointsMatch, type Point } from "./support/geometry";
import { placedBooks, prisma, putPlacement, reseed, type PlacedBook } from "./support/scenes";
import { intersects, targetSizeFailures, type Box } from "./support/target-size";

type Scene = (typeof SCENES)[number];
type Viewport = { width: number; height: number };

const SCENE = "[data-bookshop-scene]";
const EDGE = "[data-hotspot-edge]";
const FOCUS_SVG = "[data-hotspot-focus]";
const SCENE_LINKS = `${SCENE} a[href^="/books/"]`;
const MIN_SCENE_FOR_HOTSPOTS = 808;
const SIDE_PADDING = 32;
const CHROME = 96;
const SCENE_MAX_WIDTH = 1920;
const MIN_MARGIN_PX = 1;

const DESKTOP: Viewport = { width: 1440, height: 900 };
const WIDE: Viewport = { width: 1952, height: 1200 }; // scene is its full 1920px

// BD #36: the viewports where the page must never scroll.
const FIT_VIEWPORTS: Viewport[] = [
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

const placed = new Map<string, PlacedBook[]>();
const booksOf = (scene: Scene): PlacedBook[] => placed.get(scene.id) ?? [];

test.beforeAll(async () => {
  reseed();
  for (const scene of SCENES) placed.set(scene.id, await placedBooks(scene.id));
  expect(booksOf(SCENES[0]), "precondition: the seed places 25 books in bookshop").toHaveLength(25);
  for (const scene of SCENES) {
    expect(booksOf(scene), `precondition: the seed fills every slot of ${scene.id}`).toHaveLength(scene.hotspots.length);
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- helpers

const urlOf = (scene: Scene) => (scene.id === DEFAULT_SCENE_ID ? "/" : `/shops/${scene.id}`);
const sceneImg = (scene: Scene) => `img[srcset*="/bookshop/${scene.id}@"]`;
const servedPath = (scene: Scene, width: number) => `/bookshop/${scene.id}@${scene.artwork.version}-${width}.webp`;
const ratioOf = (scene: Scene) => scene.artwork.size.width / scene.artwork.size.height;
const hotspotName = (b: PlacedBook) => `${b.title} by ${b.author}`;
const hotspot = (page: Page, b: PlacedBook) => page.locator(SCENE).getByRole("link", { name: hotspotName(b), exact: true });
const drawerButton = (page: Page) => page.getByRole("button", { name: /^All \d+ on display$/ });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Books on display" });
const switcher = (page: Page) => page.getByRole("navigation", { name: "Shops", exact: true });
const label = (page: Page, b: PlacedBook) =>
  page.locator('[aria-hidden="true"]').filter({ hasText: b.title }).filter({ hasText: b.author }).first();
const shapeOf = (scene: Scene, slot: number): readonly Point[] => {
  const h = scene.hotspots.find((x) => x.slot === slot);
  if (!h) throw new Error(`${scene.id} has no hotspot for slot ${slot}`);
  return h.shape;
};
const sampleSlots = (scene: Scene): number[] => {
  const n = scene.hotspots.length;
  return [1, Math.ceil(n / 2), n];
};
const expectedSceneWidth = (scene: Scene, v: Viewport) =>
  Math.min(v.width - SIDE_PADDING, (v.height - CHROME) * ratioOf(scene), SCENE_MAX_WIDTH);
const viewportFor = (width: number): Viewport => ({ width, height: width < 1024 ? 1024 : 900 });

async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} has no layout box`);
  return box;
}

async function open(page: Page, scene: Scene, viewport: Viewport = DESKTOP): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(urlOf(scene));
  await expect(page.locator(sceneImg(scene))).toBeVisible();
}

async function activeHref(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("href") ?? null);
}

async function tabTo(page: Page, href: string, maxPresses = 160): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if ((await activeHref(page)) === href) return;
  }
  throw new Error(`Tab never reached ${href}`);
}

async function settle(link: Locator): Promise<void> {
  await link.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

type Aim = { link: Locator; box: Box; inside: Point; outside: Point | null };

/** Scrolls the link into view, then picks a point well inside its silhouette and, if there is one, a point well outside. */
async function aim(page: Page, scene: Scene, b: PlacedBook): Promise<Aim> {
  const link = hotspot(page, b);
  await link.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  const box = await boxOf(link, `slot ${b.slot}`);
  const { inside, outside } = pickPoints(shapeOf(scene, b.slot), box);
  if (!inside || inside.margin < MIN_MARGIN_PX) {
    throw new Error(`${scene.id} slot ${b.slot}: no point lies ${MIN_MARGIN_PX}px inside the silhouette`);
  }
  const toViewport = (p: Point): Point => [box.x + p[0], box.y + p[1]];
  return {
    link,
    box,
    inside: toViewport(inside.point),
    outside: outside && outside.margin >= MIN_MARGIN_PX ? toViewport(outside.point) : null,
  };
}

async function hrefAt(page: Page, [x, y]: Point): Promise<string | null> {
  return page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest("a")?.getAttribute("href") ?? null, [x, y] as const);
}

const focusSvgFor = (link: Locator): Locator => link.locator("xpath=following-sibling::*[@data-hotspot-focus][1]");
const displayOf = (el: Locator): Promise<string> => el.evaluate((e) => getComputedStyle(e).display);

function expectInside(inner: Box, outer: Box, what: string, tolerance = 1): void {
  expect(inner.x, `${what}: left edge`).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.y, `${what}: top edge`).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.x + inner.width, `${what}: right edge`).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(inner.y + inner.height, `${what}: bottom edge`).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}

async function expectNeverScrolls(page: Page, scene: Scene, what: string): Promise<void> {
  const m = await page.evaluate(() => {
    const root = document.documentElement;
    const before = { x: window.scrollX, y: window.scrollY };
    window.scrollTo(1_000_000, 1_000_000);
    const maxScroll = { x: window.scrollX, y: window.scrollY };
    window.scrollTo(before.x, before.y);
    return { sh: root.scrollHeight, sw: root.scrollWidth, ih: window.innerHeight, iw: window.innerWidth, maxScroll };
  });
  expect(m.sh, `${what}: scrollHeight vs innerHeight ${m.ih}`).toBeLessThanOrEqual(m.ih);
  expect(m.sw, `${what}: scrollWidth vs innerWidth ${m.iw}`).toBeLessThanOrEqual(m.iw);
  expect(m.maxScroll, `${what}: the page can be scrolled`).toEqual({ x: 0, y: 0 });
  const scene_ = await boxOf(page.locator(sceneImg(scene)), "scene artwork");
  expect(scene_.y + scene_.height + 32, `${what}: scene bottom + 32px vs viewport height`).toBeLessThanOrEqual(m.ih + 1);
}

// ---------------------------------------------------------------- #13 #14 #20 without client JS

test.describe("without client JS", () => {
  test.use({ javaScriptEnabled: false, viewport: DESKTOP });

  for (const scene of SCENES) {
    test(`#13/#14 ${urlOf(scene)}: server HTML has one named link per placed book, the scene's three files and its alt`, async ({ page }) => {
      await page.goto(urlOf(scene));
      const list = booksOf(scene);

      for (const b of list) {
        const link = hotspot(page, b);
        await expect(link, hotspotName(b)).toHaveCount(1);
        await expect(link).toHaveAttribute("href", `/books/${b.slug}`);
      }
      await expect(page.locator(SCENE_LINKS), "no other book links in the scene").toHaveCount(list.length);

      const img = page.locator(sceneImg(scene));
      await expect(img, "the scene's artwork").toHaveCount(1);
      await expect(img).toHaveAttribute("alt", scene.alt);
      const srcset = (await img.getAttribute("srcset")) ?? "";
      for (const w of scene.artwork.widths) {
        expect(srcset, `srcset lists ${servedPath(scene, w)}`).toMatch(new RegExp(`${servedPath(scene, w).replace(/[.]/g, "\\.")}\\s+${w}w`));
      }
      for (const other of SCENES.filter((s) => s.id !== scene.id)) {
        expect(srcset, `srcset has nothing of ${other.id}`).not.toContain(`/bookshop/${other.id}@`);
      }
    });
  }

  test("#20 the switcher links reach each scene and back, without JS", async ({ page }) => {
    await page.goto("/");
    for (const scene of SCENES.filter((s) => s.id !== DEFAULT_SCENE_ID)) {
      await switcher(page).getByRole("link", { name: scene.name, exact: true }).click();
      await expect(page).toHaveURL((u) => u.pathname === `/shops/${scene.id}`);
      await expect(page.locator(sceneImg(scene))).toHaveCount(1);

      const home = SCENES.find((s) => s.id === DEFAULT_SCENE_ID);
      await switcher(page).getByRole("link", { name: home?.name ?? "", exact: true }).click();
      await expect(page).toHaveURL((u) => u.pathname === "/");
    }
  });
});

// ---------------------------------------------------------------- #14 geometry in a browser

test.describe("each hotspot sits on its rectangle", () => {
  test.use({ viewport: DESKTOP });

  for (const scene of SCENES) {
    test(`#14 ${scene.id}: every link's box is its slot's rectangle, within 1.5px`, async ({ page }) => {
      await open(page, scene);
      const img = await boxOf(page.locator(sceneImg(scene)), "scene artwork");
      for (const b of booksOf(scene)) {
        const h = scene.hotspots.find((x) => x.slot === b.slot);
        if (!h) throw new Error(`no hotspot for slot ${b.slot}`);
        const box = await boxOf(hotspot(page, b), hotspotName(b));
        const want = {
          x: img.x + (img.width * h.rect.left) / 100,
          y: img.y + (img.height * h.rect.top) / 100,
          width: (img.width * h.rect.width) / 100,
          height: (img.height * h.rect.height) / 100,
        };
        const what = `${scene.id} slot ${b.slot}`;
        expect(Math.abs(box.x - want.x), `${what} x`).toBeLessThanOrEqual(1.5);
        expect(Math.abs(box.y - want.y), `${what} y`).toBeLessThanOrEqual(1.5);
        expect(Math.abs(box.width - want.width), `${what} width`).toBeLessThanOrEqual(1.5);
        expect(Math.abs(box.height - want.height), `${what} height`).toBeLessThanOrEqual(1.5);
      }
    });
  }
});

// ---------------------------------------------------------------- #15 #16 routing

test.describe("routing", () => {
  test("#15 GET /shops/bookshop is a permanent redirect to /", async ({ request }) => {
    const res = await request.get("/shops/bookshop", { maxRedirects: 0 });
    expect([301, 308], `status ${res.status()}`).toContain(res.status());
    expect(new URL(res.headers()["location"] ?? "", "http://localhost").pathname).toBe("/");
  });

  for (const id of ["nope", "..%2Fx", "BOOKSHOP", "Abbey", "__proto__", "constructor"]) {
    test(`#16 GET /shops/${id} is a 404`, async ({ request }) => {
      // Control: without it this passes while the route does not exist at all.
      const control = await request.get(`/shops/${SCENES[1].id}`, { maxRedirects: 0 });
      expect(control.status(), `control: /shops/${SCENES[1].id} is served`).toBe(200);

      const res = await request.get(`/shops/${id}`, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  }

  // The spec says an unknown id runs no placement query. A test cannot watch queries, so this plants placements under an
  // id the registry doesn't know: a route that asked the database first and only then decided would find rows and render.
  test("#16 an id that is not in the registry is a 404 even when the database holds placements for it", async ({ request }) => {
    const book = booksOf(SCENES[0])[0];
    await prisma.placement.deleteMany({ where: { sceneId: "ghost-shop" } });
    await prisma.placement.create({ data: { sceneId: "ghost-shop", slot: 1, bookId: book.id } });
    try {
      const control = await request.get(`/shops/${SCENES[1].id}`, { maxRedirects: 0 });
      expect(control.status(), `control: /shops/${SCENES[1].id} is served`).toBe(200);
      const res = await request.get("/shops/ghost-shop", { maxRedirects: 0 });
      expect(res.status()).toBe(404);
      expect(await res.text()).not.toContain(`/books/${book.slug}`);
    } finally {
      await prisma.placement.deleteMany({ where: { sceneId: "ghost-shop" } });
    }
  });
});

// ---------------------------------------------------------------- #17 calibration overlay

test.describe("calibration overlay", () => {
  test.use({ viewport: DESKTOP });

  for (const scene of SCENES) {
    const n = scene.hotspots.length;

    test(`#17 (development) ${urlOf(scene)}?hotspots=1 labels all ${n} slot rectangles with their numbers`, async ({ page }) => {
      test.skip(process.env.E2E_PRODUCTION === "1", "development-only behaviour");
      await page.goto(`${urlOf(scene)}?hotspots=1`);
      for (let i = 1; i <= n; i++) {
        await expect(page.getByText(String(i), { exact: true }).first(), `slot ${i} label`).toBeVisible();
      }
    });

    for (const query of ["", "?hotspots=yes"]) {
      test(`#17 ${urlOf(scene)}${query} shows no calibration overlay`, async ({ page }) => {
        await page.goto(`${urlOf(scene)}${query}`);
        await expect(page.locator(sceneImg(scene))).toBeVisible();
        for (let i = 1; i <= n; i++) {
          await expect(page.getByText(String(i), { exact: true }), `slot ${i} label`).toHaveCount(0);
        }
      });
    }

    test(`#17 (production) ${urlOf(scene)}?hotspots=1 renders the normal page`, async ({ page }) => {
      test.skip(process.env.E2E_PRODUCTION !== "1", "requires a production build; set E2E_PRODUCTION=1");
      await page.goto(`${urlOf(scene)}?hotspots=1`);
      await expect(page.locator(sceneImg(scene))).toBeVisible();
      for (let i = 1; i <= n; i++) {
        await expect(page.getByText(String(i), { exact: true }), `slot ${i} label`).toHaveCount(0);
      }
    });
  }
});

// ---------------------------------------------------------------- #18 one book, two scenes

test.describe("a book placed in two scenes", () => {
  test.use({ viewport: DESKTOP });

  test("#18 links to the same /books/{slug} from both scenes", async ({ page }) => {
    const [home, other] = [SCENES[0], SCENES[1]];
    const shared = booksOf(home)[0];
    try {
      await putPlacement(other.id, 1, shared.id);

      for (const scene of [home, other]) {
        await open(page, scene);
        const link = hotspot(page, shared);
        await expect(link, `${scene.id}: the shared book's link`).toHaveCount(1);
        await expect(link).toHaveAttribute("href", `/books/${shared.slug}`);
      }
    } finally {
      reseed();
    }
  });
});

// ---------------------------------------------------------------- #19 the book page

test.describe("the book detail page is unchanged", () => {
  for (const scene of SCENES) {
    test(`#19 a book from ${scene.id}: backdrop is bookshop@v1-1376.webp and "Back to the shop" goes to /`, async ({ page }) => {
      const book = booksOf(scene)[0];
      const requested: string[] = [];
      page.on("request", (r) => requested.push(new URL(r.url()).pathname));

      await page.goto(`/books/${book.slug}`);
      await page.waitForLoadState("networkidle");

      expect(requested, "the backdrop file").toContain("/bookshop/bookshop@v1-1376.webp");
      expect(requested.filter((p) => p.startsWith("/bookshop/abbey@")), "no other scene's artwork").toEqual([]);
      await expect(page.getByRole("link", { name: "Back to the shop", exact: true })).toHaveAttribute("href", "/");
    });
  }
});

// ---------------------------------------------------------------- #20 #21 the switcher

test.describe("the shop switcher", () => {
  for (const scene of SCENES) {
    test(`#20 on ${urlOf(scene)}: one link per scene in registry order, the current one marked aria-current="page"`, async ({ page }) => {
      await open(page, scene);
      const nav = switcher(page);
      await expect(nav).toHaveCount(1);
      const links = nav.getByRole("link");
      await expect(links).toHaveText(SCENES.map((s) => s.name));

      for (const [i, s] of SCENES.entries()) {
        await expect(links.nth(i), `${s.name} href`).toHaveAttribute("href", s.id === DEFAULT_SCENE_ID ? "/" : `/shops/${s.id}`);
        if (s.id === scene.id) {
          await expect(links.nth(i), `${s.name} is current`).toHaveAttribute("aria-current", "page");
        } else {
          expect(await links.nth(i).getAttribute("aria-current"), `${s.name} is not current`).toBeNull();
        }
      }
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    });
  }

  for (const scene of SCENES) {
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      test(`#21 ${urlOf(scene)} at ${viewport.width}px: 64px toolbar, nothing overlaps, switcher reachable and before the drawer button`, async ({ page }) => {
        await open(page, scene, viewport);
        const nav = switcher(page);
        const button = drawerButton(page);
        const navBox = await boxOf(nav, "switcher");
        const buttonBox = await boxOf(button, "drawer button");
        const sceneBox = await boxOf(page.locator(sceneImg(scene)), "scene artwork");

        const toolbarHeight = await nav.evaluate((navEl, buttonEl) => {
          let el: Element | null = navEl;
          while (el && !el.contains(buttonEl)) el = el.parentElement;
          return el ? el.getBoundingClientRect().height : NaN;
        }, await button.elementHandle());
        expect(Math.abs(toolbarHeight - 64), `toolbar is ${toolbarHeight}px high`).toBeLessThanOrEqual(0.5);

        expect(intersects(navBox, buttonBox), "switcher vs drawer button").toBe(false);
        expect(intersects(navBox, sceneBox), "switcher vs scene").toBe(false);
        expect(intersects(buttonBox, sceneBox), "drawer button vs scene").toBe(false);

        const hrefs = await nav.getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
        const seen: string[] = [];
        for (let i = 0; i < 20; i++) {
          await page.keyboard.press("Tab");
          const what = await page.evaluate(() => {
            const el = document.activeElement;
            if (el?.closest('nav[aria-label="Shops"]')) return `switcher:${el.getAttribute("href")}`;
            if (el?.tagName === "BUTTON" && /^All \d+ on display$/.test(el.textContent?.trim() ?? "")) return "drawer";
            return "other";
          });
          seen.push(what);
          if (what === "drawer") break;
        }
        expect(seen.at(-1), `Tab reached the drawer button; saw ${JSON.stringify(seen)}`).toBe("drawer");
        for (const href of hrefs) {
          expect(seen, `Tab reaches the switcher link ${href} before the drawer button`).toContain(`switcher:${href}`);
        }
      });
    }
  }
});

// ---------------------------------------------------------------- #22 the drawer shows the current scene

test.describe("the drawer shows only the current scene's books", () => {
  test.use({ viewport: DESKTOP });

  for (const scene of SCENES) {
    test(`#22 ${urlOf(scene)}: the button count, the sidebar and the hotspots list the same books in slot order`, async ({ page }) => {
      await open(page, scene);
      const list = booksOf(scene);
      await expect(drawerButton(page)).toHaveText(`All ${list.length} on display`);
      await drawerButton(page).click();

      const sidebarHrefs = await sidebar(page).getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      expect(sidebarHrefs).toEqual(list.map((b) => `/books/${b.slug}`));
      const hotspotHrefs = await page.locator(SCENE_LINKS).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      expect(hotspotHrefs).toEqual(sidebarHrefs);
    });
  }
});

// ---------------------------------------------------------------- #23 fit, ratio, no layout shift

test.describe("the scene fits the window, for every scene's own ratio", () => {
  for (const scene of SCENES) {
    for (const viewport of FIT_VIEWPORTS) {
      test(`#23 ${urlOf(scene)} at ${viewport.width}×${viewport.height}: width follows the rule and the page never scrolls`, async ({ page }) => {
        await open(page, scene, viewport);
        const box = await boxOf(page.locator(sceneImg(scene)), "scene artwork");
        const expected = expectedSceneWidth(scene, viewport);

        expect(Math.abs(box.width - expected), `scene is ${box.width.toFixed(1)}px wide, expected ${expected.toFixed(1)}px`).toBeLessThanOrEqual(1);
        expect(Math.abs(box.height - box.width / ratioOf(scene)), "height follows the artwork's ratio").toBeLessThanOrEqual(1);
        const button = await boxOf(drawerButton(page), "drawer button");
        expect(intersects(button, box), "the toolbar does not overlap the scene").toBe(false);
        await expectNeverScrolls(page, scene, `${scene.id} ${viewport.width}×${viewport.height}`);
      });
    }

    test(`#23 ${urlOf(scene)}: the scene holds the artwork's aspect ratio before the image loads`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.route(`**/bookshop/${scene.id}@*.webp`, () => {
        // Never answer: the image stays pending for the whole test.
      });
      await page.goto(urlOf(scene), { waitUntil: "domcontentloaded" });
      const box = await boxOf(page.locator(sceneImg(scene)), "scene artwork");
      expect(box.width / box.height).toBeCloseTo(ratioOf(scene), 2);
    });

    test(`#23 ${urlOf(scene)}: loading the artwork causes no layout shift`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
            if (!entry.hadRecentInput) w.__cls += entry.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(urlOf(scene));
      await expect(page.locator(sceneImg(scene))).toHaveJSProperty("complete", true);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
    });
  }
});

// ---------------------------------------------------------------- #24 responsive image selection

test.describe("the browser loads the smallest file that covers the rendered width", () => {
  const cases = [
    { width: 375, height: 812, dpr: 2 },
    { width: 1440, height: 900, dpr: 1 },
    { width: 1440, height: 900, dpr: 2 },
  ];

  for (const scene of SCENES) {
    for (const c of cases) {
      test(`#24 ${urlOf(scene)} at ${c.width}×${c.height} @${c.dpr}x`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL, viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.dpr });
        try {
          const page = await context.newPage();
          await page.goto(urlOf(scene));
          const img = page.locator(sceneImg(scene));
          await expect(img).toHaveJSProperty("complete", true);

          const needed = (await boxOf(img, "scene artwork")).width * c.dpr;
          const widths = [...scene.artwork.widths].sort((a, b) => a - b);
          const expected = widths.find((w) => w >= needed) ?? widths[widths.length - 1];
          const src = new URL(await img.evaluate((el) => (el as HTMLImageElement).currentSrc)).pathname;
          expect(src, `needs ${needed.toFixed(0)} device px`).toBe(servedPath(scene, expected));
        } finally {
          await context.close();
        }
      });
    }
  }
});

// ---------------------------------------------------------------- #25 breakpoint and target size

test.describe("breakpoint and target size", () => {
  for (const scene of SCENES) {
    const n = scene.hotspots.length;

    test(`#25 ${urlOf(scene)}: at a scene width of ${MIN_SCENE_FOR_HOTSPOTS}px the hotspots, edges and rings are shown`, async ({ page }) => {
      await open(page, scene, { width: MIN_SCENE_FOR_HOTSPOTS + SIDE_PADDING, height: 1024 });
      const box = await boxOf(page.locator(sceneImg(scene)), "scene artwork");
      expect(box.width, "precondition: the scene is 808px wide").toBeGreaterThanOrEqual(MIN_SCENE_FOR_HOTSPOTS - 1);

      await expect(page.locator(SCENE).getByRole("link"), "hotspots are in the accessibility tree").toHaveCount(n);
      for (const selector of [EDGE]) {
        const displays = await page.locator(selector).evaluateAll((els) => els.map((el) => getComputedStyle(el).display));
        expect(displays, `${selector} elements`).toHaveLength(n);
        expect(displays.filter((d) => d === "none"), `${selector} elements that are hidden`).toEqual([]);
      }
    });

    for (const width of [375, MIN_SCENE_FOR_HOTSPOTS + SIDE_PADDING - 1]) {
      test(`#25 ${urlOf(scene)} at a ${width}px window the scene is under ${MIN_SCENE_FOR_HOTSPOTS}px: hotspots, edges and rings are hidden, unfocusable and not clickable`, async ({ page }) => {
        await open(page, scene, viewportFor(width));
        const box = await boxOf(page.locator(sceneImg(scene)), "scene artwork");
        expect(box.width, "precondition: the scene is narrower than 808px").toBeLessThan(MIN_SCENE_FOR_HOTSPOTS);

        await expect(page.locator(SCENE).getByRole("link"), "no hotspot in the accessibility tree").toHaveCount(0);
        for (const selector of [EDGE, FOCUS_SVG]) {
          const displays = await page.locator(selector).evaluateAll((els) => els.map((el) => getComputedStyle(el).display));
          expect(displays.length, `${selector} elements exist in the markup`).toBe(n);
          expect(new Set(displays), `${selector}: computed display`).toEqual(new Set(["none"]));
        }
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press("Tab");
          expect(await activeHref(page), "no /books/ link takes focus").not.toMatch(/^\/books\//);
        }
        const clickable = await page.evaluate(
          (selector) =>
            [...document.querySelectorAll(selector)].filter((el) => {
              const s = getComputedStyle(el);
              return s.display !== "none" && s.pointerEvents !== "none" && s.visibility !== "hidden";
            }).length,
          SCENE_LINKS,
        );
        expect(clickable, "hotspot links that could still be clicked").toBe(0);
      });
    }

    for (const [sceneWidth, viewport] of [
      [808, { width: 840, height: 1024 }],
      [1280, { width: 1312, height: 1024 }],
      [1920, WIDE],
    ] as const) {
      test(`#25 ${urlOf(scene)} at a scene width of ${sceneWidth}px every hotspot meets WCAG 2.5.8 (as BD #13)`, async ({ page }) => {
        await open(page, scene, viewport);
        const box = await boxOf(page.locator(sceneImg(scene)), "scene artwork");
        expect(Math.abs(box.width - sceneWidth), `precondition: scene is ${box.width.toFixed(1)}px wide`).toBeLessThanOrEqual(1);

        const targets = [];
        for (const b of booksOf(scene)) targets.push({ name: `slot ${b.slot}`, box: await boxOf(hotspot(page, b), `slot ${b.slot}`) });
        expect(targetSizeFailures(targets)).toEqual([]);
      });
    }
  }
});

// ---------------------------------------------------------------- #27 carried over, for every scene

test.describe("hotspot behaviour on every scene", () => {
  test.use({ viewport: WIDE });

  for (const scene of SCENES) {
    const list = booksOf(scene);
    const bookAt = (slot: number): PlacedBook => {
      const b = list.find((x) => x.slot === slot);
      if (!b) throw new Error(`${scene.id}: no book in slot ${slot}`);
      return b;
    };

    test(`#27 ${scene.id}: Tab visits the books in slot order 1→N`, async ({ page }) => {
      await open(page, scene, WIDE);
      const visited: string[] = [];
      for (let i = 0; i < 160 && visited.length < list.length; i++) {
        await page.keyboard.press("Tab");
        const href = await activeHref(page);
        if (href?.startsWith("/books/")) visited.push(href);
      }
      expect(visited).toEqual(list.map((b) => `/books/${b.slug}`));
    });

    test(`#27 ${scene.id}: one edge svg and one ring svg per book, each following a silhouette of the scene`, async ({ page }) => {
      await open(page, scene, WIDE);
      const n = list.length;
      await expect(page.locator(EDGE), "one edge svg per placed book").toHaveCount(n);
      await expect(page.locator(FOCUS_SVG), "one focus-ring svg per placed book").toHaveCount(n);
      await expect(page.locator(`a ${EDGE}, a ${FOCUS_SVG}`), "no decoration inside a link").toHaveCount(0);

      const polygons = async (selector: string) =>
        (await page.locator(selector).evaluateAll((els) => els.map((e) => e.getAttribute("points")))).map((p) => parsePoints(p));
      for (const [what, selector] of [
        ["edge base", `${EDGE} polygon[data-edge="base"]`],
        ["edge glint", `${EDGE} polygon[data-edge="glint"]`],
        ["ring outer", `${FOCUS_SVG} polygon[data-ring="outer"]`],
        ["ring inner", `${FOCUS_SVG} polygon[data-ring="inner"]`],
      ] as const) {
        const found = await polygons(selector);
        expect(found, `${what} polygons`).toHaveLength(n);
        for (const h of scene.hotspots) {
          const matches = found.filter((p) => pointsMatch(p, h.shape, 0.01)).length;
          expect(matches, `${what}: a polygon for slot ${h.slot}'s shape`).toBeGreaterThanOrEqual(1);
        }
      }
    });

    for (const slot of sampleSlots(scene)) {
      test(`#27 ${scene.id} slot ${slot}: the silhouette is the hit area, hover shows the label and the clip-path, focus shows the ring`, async ({ page }) => {
        test.setTimeout(90_000);
        const b = bookAt(slot);
        await open(page, scene, WIDE);
        const a = await aim(page, scene, b);

        expect(await hrefAt(page, a.inside), "a point inside the silhouette hits the link").toBe(`/books/${b.slug}`);
        if (a.outside) {
          expect(await hrefAt(page, a.outside), "a point in the rectangle but outside the silhouette does not").not.toBe(`/books/${b.slug}`);
        }

        await page.mouse.move(0, 0);
        await page.mouse.move(...a.inside);
        await expect(label(page, b), "label on hover").toBeVisible();
        await settle(a.link);
        const clipPath = await a.link.evaluate((el) => getComputedStyle(el).clipPath);
        const clip = parseClipPath(clipPath, a.box);
        expect(clip, `clip-path is a polygon (was "${clipPath}")`).not.toBeNull();
        expect(pointsMatch(clip ?? [], shapeOf(scene, slot), 0.5), `clip-path ${clipPath}`).toBe(true);
        await page.mouse.move(0, 0);
        await expect(label(page, b), "label after leaving").toBeHidden();
        if (a.outside) {
          await page.mouse.move(...a.outside);
          await expect(label(page, b), "no label outside the silhouette").toBeHidden({ timeout: 1_500 });
          await page.mouse.move(0, 0);
        }

        await tabTo(page, `/books/${b.slug}`);
        await expect(a.link).toBeFocused();
        await expect(label(page, b), "label on keyboard focus").toBeVisible();
        const ring = focusSvgFor(a.link);
        await expect(ring, "the link has a following-sibling ring svg").toHaveCount(1);
        expect(await displayOf(ring), "ring shown on keyboard focus").not.toBe("none");
      });
    }

    for (const width of [1440, 1024, MIN_SCENE_FOR_HOTSPOTS + SIDE_PADDING]) {
      test(`#27 ${scene.id}: at ${width}px the label stays within the scene for every hotspot (hover and focus)`, async ({ page }) => {
        test.setTimeout(180_000);
        await open(page, scene, viewportFor(width));
        for (const b of list) {
          const link = hotspot(page, b);

          await link.hover();
          await expect(label(page, b)).toBeVisible();
          expectInside(await boxOf(label(page, b), "label"), await boxOf(page.locator(sceneImg(scene)), "scene"), `hover slot ${b.slot}`);
          await page.mouse.move(0, 0);

          await link.focus();
          await expect(label(page, b)).toBeVisible();
          expectInside(await boxOf(label(page, b), "label"), await boxOf(page.locator(sceneImg(scene)), "scene"), `focus slot ${b.slot}`);
          await link.blur();
        }
      });
    }
  }
});
