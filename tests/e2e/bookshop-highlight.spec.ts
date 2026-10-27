// Spec: docs/specs/bookshop-display.md → "Hotspot shape, highlight and glowing edge"
// Criteria covered here: #29 #30 #31 #32 #33 #34
// Covered by a unit test instead: #28 (src/components/bookshop/hotspot-shapes.test.ts)
// Not automated: #35 (manual calibration check by the tester: each edge sits on its book's outline in
// the artwork, compared against mockups/bookstore-display/ at 1440px and 1024px).
//
// Assumptions about the markup, all taken from the spec:
// - Each displayed book has one <svg data-hotspot-edge> covering the link's box, so it is paired with its
//   link by geometry. Its polygons are marked data-edge="base" and data-edge="glint".
// - Each displayed book has one <svg data-hotspot-focus> that is a following sibling of its <a>, holding
//   polygons marked data-ring="outer" and data-ring="inner".
// - The polygons' `points` are the book's `shape`, because both svgs use viewBox="0 0 100 100".
//
// Preconditions are the same as tests/e2e/bookshop-display.spec.ts: the server reads a database whose name
// contains "test", and this file reseeds it. The config runs a single worker, so tests never overlap.
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Hotspot } from "../../src/components/bookshop/hotspots";
import { DEFAULT_SCENE } from "../../src/components/bookshop/scenes";
import { hexToCss } from "../support/contrast";
import { placedBooks, prisma, reseed } from "./support/scenes";
import type { DisplayRow } from "./support/db";
import {
  allZero,
  parseClipPath,
  parseCssColor,
  parsePoints,
  pickPoints,
  pointsMatch,
  type Point,
} from "./support/geometry";

const HOTSPOTS = DEFAULT_SCENE.hotspots;

type Box = { x: number; y: number; width: number; height: number };
type WithShape = { shape?: readonly Point[] };

// The scene is limited by the window height too (spec: Scales to fit the window), so the viewport is tall
// enough, (1200 − 96) × 2752/1536 ≥ 1920, for the scene to be its full 1920px, where small books are as large as they get.
const DESKTOP = { width: 1952, height: 1200 } as const;
const SCENE = "[data-bookshop-scene]";
const SCENE_IMG = `img[srcset*="/bookshop/${DEFAULT_SCENE.id}@"]`;
const EDGE = "[data-hotspot-edge]";
const FOCUS_SVG = "[data-hotspot-focus]";
const BOOK_LINKS = `${SCENE} a[href^="/books/"]`;
/** Slots sampled by the tests that are slow per book: the first, a display-stand book and the last. */
const SAMPLE_SLOTS = [1, 13, 25] as const;
/** A hit-test point must be this far (CSS px) from the silhouette edge to count, so rounding cannot decide a test. */
const MIN_MARGIN_PX = 1;
/** Most silhouettes must leave a corner of their rectangle uncovered, or a rectangle would pass #29 for free. */
const MIN_SLOTS_WITH_UNCOVERED_CORNER = 20;

const REST_EDGE = { stroke: hexToCss("#ffe0a2"), minOpacity: 0.4, maxOpacity: 0.6 };
const RING = { inner: hexToCss("#ffe5b2"), outer: hexToCss("#1f140e") };

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

const hotspotName = (b: DisplayRow) => `${b.title} by ${b.author}`;
const hotspot = (page: Page, b: DisplayRow) => page.getByRole("link", { name: hotspotName(b), exact: true });
/** The hover/focus label is decorative (aria-hidden) and shows the title and author. */
const label = (page: Page, b: DisplayRow) =>
  page.locator('[aria-hidden="true"]').filter({ hasText: b.title }).filter({ hasText: b.author }).first();

function bookAt(slot: number): DisplayRow {
  const b = books.find((x) => x.slot === slot);
  if (!b) throw new Error(`no book in slot ${slot}`);
  return b;
}

function shapeFor(slot: number): readonly Point[] {
  const hotspotForSlot = HOTSPOTS.find((h) => h.slot === slot) as (Hotspot & WithShape) | undefined;
  if (!hotspotForSlot?.shape) throw new Error(`HOTSPOTS slot ${slot} has no shape (criterion 28)`);
  return hotspotForSlot.shape;
}

async function activeHref(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("href") ?? null);
}

async function tabTo(page: Page, href: string, maxPresses = 120): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if ((await activeHref(page)) === href) return;
  }
  throw new Error(`Tab never reached ${href}`);
}

/** Lets the link's own transition finish. The glint loops forever, so waiting on every animation would hang. */
async function settle(link: Locator): Promise<void> {
  await link.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

type Aim = { link: Locator; box: Box; inside: Point; outside: Point | null };

/**
 * Scrolls the book's link to the middle of the viewport and picks one point well inside its silhouette
 * and, when the silhouette leaves part of the rectangle uncovered, one point well outside it.
 * Both are in viewport coordinates.
 */
async function aim(page: Page, b: DisplayRow): Promise<Aim> {
  const link = hotspot(page, b);
  await link.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  const box = await link.boundingBox();
  if (!box) throw new Error(`slot ${b.slot}: the link has no layout box`);
  const { inside, outside } = pickPoints(shapeFor(b.slot), box);
  if (!inside || inside.margin < MIN_MARGIN_PX) {
    throw new Error(`slot ${b.slot}: no point lies ${MIN_MARGIN_PX}px inside the silhouette (margin ${inside?.margin})`);
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
  return page.evaluate(
    ([px, py]) => document.elementFromPoint(px, py)?.closest("a")?.getAttribute("href") ?? null,
    [x, y] as const,
  );
}

type LinkStyle = {
  background: string;
  clipPath: string;
  outlineStyle: string;
  outlineWidth: string;
  boxShadow: string;
};

const linkStyle = (link: Locator): Promise<LinkStyle> =>
  link.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      clipPath: s.clipPath,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      boxShadow: s.boxShadow,
    };
  });

/** The <svg data-hotspot-edge> that covers the link's box. The spec makes it cover the box, so geometry pairs them. */
async function edgeFor(page: Page, link: Locator): Promise<Locator> {
  const box = await link.boundingBox();
  if (!box) throw new Error("the link has no layout box");
  const index = await page.evaluate(
    ([x, y, w, h]) =>
      [...document.querySelectorAll("[data-hotspot-edge]")].findIndex((svg) => {
        const r = svg.getBoundingClientRect();
        return (
          Math.abs(r.x - x) <= 1.5 && Math.abs(r.y - y) <= 1.5 && Math.abs(r.width - w) <= 1.5 && Math.abs(r.height - h) <= 1.5
        );
      }),
    [box.x, box.y, box.width, box.height] as const,
  );
  if (index === -1) throw new Error("no [data-hotspot-edge] svg covers this link's box");
  return page.locator(EDGE).nth(index);
}

/** The ring svg is a following sibling of its <a>. */
const focusSvgFor = (link: Locator): Locator => link.locator("xpath=following-sibling::*[@data-hotspot-focus][1]");

type StrokeStyle = { stroke: string; width: number; opacity: number; display: string; visibility: string };

const strokeOf = (polygon: Locator): Promise<StrokeStyle> =>
  polygon.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      stroke: s.stroke,
      width: parseFloat(s.strokeWidth),
      opacity: parseFloat(s.opacity),
      display: s.display,
      visibility: s.visibility,
    };
  });

const displayOf = (el: Locator): Promise<string> => el.evaluate((e) => getComputedStyle(e).display);

function expectWarmFill(background: string, what: string): void {
  const c = parseCssColor(background);
  expect(c.a, `${what}: fill is visible (${background})`).toBeGreaterThan(0);
  expect(c.r - c.b, `${what}: fill is warm, red clearly above blue (${background})`).toBeGreaterThanOrEqual(50);
}

// ---------------------------------------------------------------- #29 silhouette hit area

test.describe("silhouette hit area", () => {
  test.use({ viewport: DESKTOP });

  test("#29 a point inside the rectangle but outside the silhouette does not hit the link; a point inside does", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();

    const withoutUncoveredCorner: number[] = [];
    for (const b of books) {
      const a = await aim(page, b);
      expect(await hrefAt(page, a.inside), `slot ${b.slot}: a point inside the silhouette hits the link`).toBe(
        `/books/${b.slug}`,
      );
      if (a.outside) {
        expect(
          await hrefAt(page, a.outside),
          `slot ${b.slot}: a point in the rectangle but outside the silhouette does not hit the link`,
        ).not.toBe(`/books/${b.slug}`);
      } else {
        withoutUncoveredCorner.push(b.slot);
      }
    }
    expect(
      books.length - withoutUncoveredCorner.length,
      `slots whose silhouette leaves part of the rectangle uncovered; without one: ${withoutUncoveredCorner.join(", ")}`,
    ).toBeGreaterThanOrEqual(MIN_SLOTS_WITH_UNCOVERED_CORNER);
  });

  test("#29 hovering inside the silhouette shows the label; hovering outside it, in the rectangle, does not", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();

    for (const b of books) {
      const a = await aim(page, b);
      await page.mouse.move(0, 0);
      await page.mouse.move(...a.inside);
      await expect(label(page, b), `slot ${b.slot}: label inside the silhouette`).toBeVisible();

      if (a.outside) {
        await page.mouse.move(0, 0);
        await expect(label(page, b), `slot ${b.slot}: label after leaving`).toBeHidden();
        await page.mouse.move(...a.outside);
        await expect(label(page, b), `slot ${b.slot}: label outside the silhouette, inside the rectangle`).toBeHidden({
          timeout: 1_500,
        });
      }
    }
  });

  test("#29 clicking inside the silhouette opens that book's detail page", async ({ page }) => {
    test.setTimeout(240_000);
    for (const b of books) {
      await page.goto("/");
      await expect(page.locator(SCENE_IMG)).toBeVisible();
      const a = await aim(page, b);
      await page.mouse.click(...a.inside);
      await expect(page, `slot ${b.slot}`).toHaveURL(new RegExp(`/books/${b.slug}$`));
    }
  });
});

// ---------------------------------------------------------------- #30 hover style

test.describe("hover style", () => {
  test.use({ viewport: DESKTOP });

  test("#30 at rest a link is transparent; on hover it is clipped to its silhouette and filled warm, with no outline or shadow", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();

    for (const b of books) {
      const a = await aim(page, b);
      const what = `slot ${b.slot}`;

      await page.mouse.move(0, 0);
      await settle(a.link);
      const rest = await linkStyle(a.link);
      expect(parseCssColor(rest.background).a, `${what}: background at rest (${rest.background})`).toBe(0);

      await page.mouse.move(...a.inside);
      await settle(a.link);
      const hovered = await linkStyle(a.link);

      const clip = parseClipPath(hovered.clipPath, a.box);
      expect(clip, `${what}: computed clip-path is a polygon (was "${hovered.clipPath}")`).not.toBeNull();
      expect(
        pointsMatch(clip ?? [], shapeFor(b.slot), 0.5),
        `${what}: clip-path ${hovered.clipPath} matches the shape ${JSON.stringify(shapeFor(b.slot))}`,
      ).toBe(true);
      expectWarmFill(hovered.background, `${what} on hover`);
      expect(
        hovered.outlineStyle === "none" || parseFloat(hovered.outlineWidth) === 0,
        `${what}: no outline on hover (${hovered.outlineStyle} ${hovered.outlineWidth})`,
      ).toBe(true);
      expect(hovered.boxShadow, `${what}: no box-shadow on hover`).toBe("none");
    }
  });
});

// ---------------------------------------------------------------- #31 glowing edge

test.describe("glowing edge", () => {
  test.use({ viewport: DESKTOP });

  test("#31 every displayed book has one decorative edge svg whose polygons follow its silhouette", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    await expect(page.locator(EDGE), "one edge svg per displayed book").toHaveCount(25);
    await expect(page.locator(`a ${EDGE}`), "no edge svg inside a link").toHaveCount(0);

    for (const b of books) {
      const what = `slot ${b.slot}`;
      const link = hotspot(page, b);
      await link.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
      const edge = await edgeFor(page, link);

      expect(await edge.evaluate((el) => el.tagName.toLowerCase()), `${what}: element`).toBe("svg");
      await expect(edge, `${what}: hidden from assistive tech`).toHaveAttribute("aria-hidden", "true");
      expect(await edge.evaluate((el) => getComputedStyle(el).pointerEvents), `${what}: pointer-events`).toBe("none");
      expect(await edge.evaluate((el) => getComputedStyle(el).filter), `${what}: glow`).toContain("drop-shadow");
      expect(await edge.evaluate((el) => el.closest("a") === null), `${what}: not inside its link`).toBe(true);

      const base = edge.locator('polygon[data-edge="base"]');
      const glint = edge.locator('polygon[data-edge="glint"]');
      await expect(base, `${what}: base polygon`).toHaveCount(1);
      await expect(glint, `${what}: glint polygon`).toHaveCount(1);
      for (const [name, polygon] of [
        ["base", base],
        ["glint", glint],
      ] as const) {
        const points = parsePoints(await polygon.getAttribute("points"));
        expect(pointsMatch(points, shapeFor(b.slot), 0.01), `${what}: ${name} points ${JSON.stringify(points)}`).toBe(true);
      }

      const rest = await strokeOf(base);
      expect(rest.stroke, `${what}: base stroke at rest`).toBe(REST_EDGE.stroke);
      expect(rest.opacity, `${what}: base opacity at rest`).toBeGreaterThanOrEqual(REST_EDGE.minOpacity);
      expect(rest.opacity, `${what}: base opacity at rest`).toBeLessThanOrEqual(REST_EDGE.maxOpacity);
    }
  });

  for (const slot of SAMPLE_SLOTS) {
    test(`#31 slot ${slot}: on hover, and again on keyboard focus, the base edge is fully opaque and thicker`, async ({
      page,
    }) => {
      const b = bookAt(slot);
      await page.goto("/");
      await expect(page.locator(SCENE_IMG)).toBeVisible();
      const a = await aim(page, b);
      const base = (await edgeFor(page, a.link)).locator('polygon[data-edge="base"]');
      const rest = await strokeOf(base);

      await page.mouse.move(...a.inside);
      await expect.poll(async () => (await strokeOf(base)).opacity, { message: "opacity on hover" }).toBe(1);
      await expect
        .poll(async () => (await strokeOf(base)).width, { message: `stroke width on hover, rest was ${rest.width}` })
        .toBeGreaterThan(rest.width);

      await page.mouse.move(0, 0);
      await expect.poll(async () => (await strokeOf(base)).opacity, { message: "opacity after hover" }).toBeLessThan(1);

      await tabTo(page, `/books/${b.slug}`);
      await expect(a.link).toBeFocused();
      await expect.poll(async () => (await strokeOf(base)).opacity, { message: "opacity on focus" }).toBe(1);
      await expect
        .poll(async () => (await strokeOf(base)).width, { message: `stroke width on focus, rest was ${rest.width}` })
        .toBeGreaterThan(rest.width);
    });
  }
});

// ---------------------------------------------------------------- #32 no tab stops, no accessible content

test.describe("accessibility of the decoration", () => {
  test.use({ viewport: DESKTOP });

  test("#32 the edge and ring svgs add no tab stops and no accessible content", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    await expect(page.locator(EDGE), "precondition: the edge svgs exist").toHaveCount(25);

    await expect(
      page.locator(`${EDGE}[tabindex], ${EDGE} [tabindex], ${FOCUS_SVG}[tabindex], ${FOCUS_SVG} [tabindex]`),
      "nothing inside the decoration is focusable by attribute",
    ).toHaveCount(0);

    const visited: string[] = [];
    for (let i = 0; i < 120 && visited.length < books.length; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => ({
        href: document.activeElement?.getAttribute("href") ?? null,
        insideSvg: document.activeElement?.closest("svg") != null,
      }));
      expect(focused.insideSvg, "focus never lands inside an svg").toBe(false);
      if (focused.href?.startsWith("/books/")) visited.push(focused.href);
    }
    expect(visited, "Tab still visits the books in slot order").toEqual(books.map((b) => `/books/${b.slug}`));

    for (const b of books) {
      await expect(hotspot(page, b), `slot ${b.slot}: one link with its name`).toHaveCount(1);
    }
    const snapshot = await page.locator(SCENE).ariaSnapshot();
    expect(snapshot.match(/^\s*- link\b/gm) ?? [], "one link per displayed book in the accessibility tree").toHaveLength(25);
    expect(snapshot.match(/^\s*- img\b/gm) ?? [], "only the artwork is an image").toHaveLength(1);
  });
});

// ---------------------------------------------------------------- #33 keyboard focus

test.describe("keyboard focus ring", () => {
  test.use({ viewport: DESKTOP });

  for (const slot of SAMPLE_SLOTS) {
    test(`#33 slot ${slot}: keyboard focus keeps the silhouette clip, drops the outline and shows a ring along the silhouette`, async ({
      page,
    }) => {
      const b = bookAt(slot);
      await page.goto("/");
      await expect(page.locator(SCENE_IMG)).toBeVisible();
      const a = await aim(page, b);
      const ring = focusSvgFor(a.link);
      await expect(ring, "the link has a following-sibling [data-hotspot-focus] svg").toHaveCount(1);

      await page.mouse.move(0, 0);
      await settle(a.link);
      const rest = await linkStyle(a.link);
      expect(await displayOf(ring), "ring at rest").toBe("none");

      await page.mouse.move(...a.inside);
      await settle(a.link);
      const hovered = await linkStyle(a.link);
      expect(await displayOf(ring), "ring on mouse hover").toBe("none");
      await page.mouse.move(0, 0);

      await tabTo(page, `/books/${b.slug}`);
      await expect(a.link).toBeFocused();
      await settle(a.link);
      const focused = await linkStyle(a.link);

      const clip = parseClipPath(focused.clipPath, a.box);
      expect(clip, `focused clip-path is a polygon (was "${focused.clipPath}")`).not.toBeNull();
      expect(pointsMatch(clip ?? [], shapeFor(slot), 0.5), `focused clip-path ${focused.clipPath}`).toBe(true);
      expect(
        focused.outlineStyle === "none" || parseFloat(focused.outlineWidth) === 0,
        `no outline on the link (${focused.outlineStyle} ${focused.outlineWidth})`,
      ).toBe(true);
      expectWarmFill(focused.background, "focused link");
      expect(focused.background, "focus fill differs from the resting fill").not.toBe(rest.background);
      expect(focused.background, "focus fill differs from the hover fill").not.toBe(hovered.background);

      await expect(ring, "ring is hidden from assistive tech").toHaveAttribute("aria-hidden", "true");
      expect(await displayOf(ring), "ring is shown on keyboard focus").not.toBe("none");
      expect(await ring.evaluate((el) => getComputedStyle(el).pointerEvents), "ring pointer-events").toBe("none");
      expect(await ring.evaluate((el) => getComputedStyle(el).filter), "ring has no glow filter").toBe("none");
      expect(await ring.evaluate((el) => el.closest("a") === null), "ring is not inside the link").toBe(true);
      await expect(a.link.locator(FOCUS_SVG), "no ring svg inside the link").toHaveCount(0);

      const outer = ring.locator('polygon[data-ring="outer"]');
      const inner = ring.locator('polygon[data-ring="inner"]');
      await expect(outer).toHaveCount(1);
      await expect(inner).toHaveCount(1);
      for (const [name, polygon] of [
        ["outer", outer],
        ["inner", inner],
      ] as const) {
        const points = parsePoints(await polygon.getAttribute("points"));
        expect(pointsMatch(points, shapeFor(slot), 0.01), `${name} ring points ${JSON.stringify(points)}`).toBe(true);
      }
      const innerStroke = await strokeOf(inner);
      const outerStroke = await strokeOf(outer);
      expect(innerStroke.stroke, "inner ring colour").toBe(RING.inner);
      expect(innerStroke.width, "inner ring width").toBeGreaterThanOrEqual(2);
      expect(outerStroke.stroke, "outer ring colour").toBe(RING.outer);
      expect(outerStroke.width, "outer ring width").toBeGreaterThanOrEqual(4);
      expect(
        await outer.evaluate((o, i) => Boolean(o.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING), await inner.elementHandle()),
        "the inner ring is drawn on top of the outer ring",
      ).toBe(true);
    });
  }

  test("#33 a mouse click on a link does not show the ring", async ({ page }) => {
    const b = bookAt(1);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    const a = await aim(page, b);
    // Keep the page on "/" so focus can be inspected after the click.
    await page.evaluate(() => document.addEventListener("click", (e) => e.preventDefault(), { capture: true }));

    await page.mouse.click(...a.inside);

    await expect(a.link, "precondition: the click focused the link").toBeFocused();
    await expect(focusSvgFor(a.link), "the link has a ring svg").toHaveCount(1);
    expect(await displayOf(focusSvgFor(a.link)), "ring after a mouse click").toBe("none");
  });
});

// ---------------------------------------------------------------- #34 glint and motion

test.describe("glint", () => {
  test.use({ viewport: DESKTOP });

  test("#34 every glint runs a 5s infinite animation and no two books start at the same point", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    const glints = page.locator(`${EDGE} polygon[data-edge="glint"]`);
    await expect(glints, "one glint per displayed book").toHaveCount(25);

    const rows = await glints.evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          duration: s.animationDuration,
          iterations: s.animationIterationCount,
          playState: s.animationPlayState,
          delay: s.animationDelay,
          running: el.getAnimations().some((a) => a.playState === "running"),
        };
      }),
    );
    for (const [i, row] of rows.entries()) {
      expect(row.duration, `glint ${i + 1}: duration`).toBe("5s");
      expect(row.iterations, `glint ${i + 1}: iteration count`).toBe("infinite");
      expect(row.playState, `glint ${i + 1}: play state`).toBe("running");
      expect(row.running, `glint ${i + 1}: has a running animation`).toBe(true);
    }
    expect(new Set(rows.map((r) => r.delay)).size, `animation-delay values: ${rows.map((r) => r.delay).join(" ")}`).toBe(25);
  });

  // Spec: "Glint" bullet. The glint travels, so its dash offset must keep changing while it runs.
  test("#34 the glint travels: its stroke-dashoffset changes while it runs", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    const glint = page.locator(`${EDGE} polygon[data-edge="glint"]`).first();
    await expect(glint).toHaveCount(1);
    const offset = () => glint.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));

    const first = await offset();
    await page.waitForTimeout(700);
    const second = await offset();

    expect(Math.abs(second - first), `dash offset went ${first} → ${second}`).toBeGreaterThan(0.01);
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: DESKTOP, reducedMotion: "reduce" });

  /** Every hotspot, edge and ring element that has a transition or an animation. */
  async function offenders(page: Page): Promise<string[]> {
    const rows = await page.evaluate(
      ([links, edge, ring]) =>
        [...document.querySelectorAll(`${links}, ${edge}, ${edge} *, ${ring}, ${ring} *`)].map((el) => {
          const s = getComputedStyle(el);
          return {
            what: `${el.tagName.toLowerCase()}${el.getAttribute("data-edge") ? `[${el.getAttribute("data-edge")}]` : ""}${el.getAttribute("data-ring") ? `[${el.getAttribute("data-ring")}]` : ""}`,
            transition: s.transitionDuration,
            animation: s.animationDuration,
            running: el.getAnimations().filter((a) => a.playState === "running").length,
          };
        }),
      [BOOK_LINKS, EDGE, FOCUS_SVG] as const,
    );
    return rows.flatMap((r) => {
      const problems: string[] = [];
      if (!allZero(r.transition)) problems.push(`transition ${r.transition}`);
      if (!allZero(r.animation)) problems.push(`animation ${r.animation}`);
      if (r.running > 0) problems.push(`${r.running} running animation(s)`);
      return problems.map((p) => `${r.what}: ${p}`);
    });
  }

  test("#34 with reduced motion nothing on any hotspot, edge or ring animates or transitions, at rest, on hover and on focus", async ({
    page,
  }) => {
    const b = bookAt(1);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    await expect(page.locator(EDGE), "precondition: the edge svgs exist").toHaveCount(25);
    const a = await aim(page, b);

    expect(await offenders(page), "at rest").toEqual([]);

    await page.mouse.move(...a.inside);
    await expect(label(page, b)).toBeVisible();
    expect(await offenders(page), "on hover").toEqual([]);
    await page.mouse.move(0, 0);

    await tabTo(page, `/books/${b.slug}`);
    await expect(a.link).toBeFocused();
    expect(await offenders(page), "on focus").toEqual([]);
  });

  test("#34 with reduced motion the base edge of every book stays visible at rest", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.locator(SCENE_IMG)).toBeVisible();
    await expect(page.locator(EDGE), "precondition: the edge svgs exist").toHaveCount(25);

    for (const b of books) {
      const link = hotspot(page, b);
      await link.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
      const edge = await edgeFor(page, link);
      await expect(edge, `slot ${b.slot}: edge svg`).toBeVisible();
      const base = await strokeOf(edge.locator('polygon[data-edge="base"]'));
      expect(base.display, `slot ${b.slot}: base display`).not.toBe("none");
      expect(base.visibility, `slot ${b.slot}: base visibility`).toBe("visible");
      expect(base.stroke, `slot ${b.slot}: base stroke`).not.toBe("none");
      expect(base.opacity, `slot ${b.slot}: base opacity`).toBeGreaterThan(0);
    }
  });
});
