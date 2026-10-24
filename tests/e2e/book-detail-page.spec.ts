// Spec: docs/specs/book-detail-page.md
// Criteria covered here: #1 #2 #3 #4 #5 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17 #18 #20 #21 #22 #23 #24 #25
// Covered in Vitest instead: #5 (slug schema), #6 (loader rejects when the DB is down), #19 (default
// palette), #26 (migration and seed) — see src/server/books.test.ts and
// tests/integration/book-detail-page.db.test.ts.
//
// Preconditions
// - The app server under test reads the same DATABASE_URL as this process, and that
//   database's name contains "test". Tests reseed it and create one fixture book
//   (slug "e2e-detail-fixture", displaySlot null) that is removed afterwards.
// - The route renders per request, so fixture changes show up on the next page load.
// - #20 uses an in-page WCAG contrast check (the spec says "checked with axe", but
//   @axe-core/playwright is not a dependency). It applies the same thresholds axe uses:
//   4.5:1, or 3:1 for large text (≥ 24px, or ≥ 18.66px bold).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { hexToCss, isReadable, type PaletteInput } from "../support/contrast";
import { FIXTURE_RANK, FIXTURE_SLUG, putFixture, removeFixture, type FixtureBook } from "./support/book-fixtures";
import { prisma, reseed } from "./support/db";

type SeededBook = { slug: string; title: string; author: string; tagline: string };
type Box = { x: number; y: number; width: number; height: number };

const URL_OF = (slug: string) => `/books/${slug}`;
const FIXTURE_URL = URL_OF(FIXTURE_SLUG);
const NOT_FOUND_HEADING = "We couldn't find that book.";
const COMING_SOON = "Buying links are coming soon.";
const DISCLOSURE = "We may earn a commission if you buy through this link.";
const SECTION_ORDER = ["What it's about", "Why people are reading it", "Why it matters", "About the author"] as const;
const BUY_URL = "https://shop.example.com/buy/quiet-lantern?ref=tob";

const READABLE: PaletteInput = { primary: "#1d3557", surface: "#f1faee", text: "#1d1d1d", highlight: "#7a1f2b" };
const UNREADABLE: PaletteInput = { primary: "#777777", surface: "#888888", text: "#999999", highlight: "#aaaaaa" };

const VIEWPORTS = {
  1440: { width: 1440, height: 900 },
  1024: { width: 1024, height: 768 },
  768: { width: 768, height: 1024 },
  375: { width: 375, height: 812 },
} as const;

let seeded: SeededBook[] = [];

test.beforeAll(async () => {
  reseed();
  seeded = await prisma.book.findMany({
    where: { slug: { not: FIXTURE_SLUG } },
    orderBy: { slug: "asc" },
    select: { slug: true, title: true, author: true, tagline: true },
  });
  expect(seeded, "precondition: the seed creates 25 books").toHaveLength(25);
});

test.afterAll(async () => {
  await removeFixture();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- helpers

const heading1 = (page: Page) => page.getByRole("heading", { level: 1 });
const byline = (page: Page, author: string) => page.getByText(`by ${author}`, { exact: true });
const buyLink = (page: Page, title: string) => page.getByRole("link", { name: `Buy ${title}`, exact: true });
const backLink = (page: Page) => page.getByRole("link", { name: "Back to the shop", exact: true });
/** The placeholder hardcover: decorative (aria-hidden) and lettered with the title and author. */
const placeholderCover = (page: Page, b: Pick<FixtureBook, "title" | "author">) =>
  page.locator('[aria-hidden="true"]').filter({ hasText: b.title }).filter({ hasText: b.author });

async function openFixture(page: Page, overrides: Partial<FixtureBook> = {}): Promise<FixtureBook> {
  const book = await putFixture(overrides);
  const response = await page.goto(FIXTURE_URL);
  expect(response?.status(), `GET ${FIXTURE_URL}`).toBe(200);
  return book;
}

async function boxOf(page: Page, selector: Locator, what: string): Promise<Box> {
  const box = await selector.boundingBox();
  if (!box) throw new Error(`${what} has no layout box on ${page.url()}`);
  return box;
}

/** Each <h2> with the text that follows it up to the next <h2> (or the end of the document). */
async function sections(page: Page): Promise<Array<{ heading: string; text: string }>> {
  return page.evaluate(() => {
    const hs = Array.from(document.querySelectorAll("h2"));
    return hs.map((h, i) => {
      const r = document.createRange();
      r.setStartAfter(h);
      const next = hs[i + 1];
      if (next) r.setEndBefore(next);
      else r.setEnd(document.body, document.body.childNodes.length);
      return { heading: (h.textContent ?? "").trim(), text: r.toString().replace(/\s+/g, " ").trim() };
    });
  });
}

/** Content elements that render with no text and no media inside them. */
async function emptyContentElements(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.body.querySelectorAll("h1, h2, h3, h4, p, section, article, blockquote, li, dd, dt"))
      .filter((el) => (el.textContent ?? "").trim() === "" && !el.querySelector("img, svg, picture, canvas"))
      .map((el) => el.outerHTML.slice(0, 160)),
  );
}

/** Computed colours of the three palette-driven surfaces the spec names in #17. */
async function paletteColours(page: Page, title: string) {
  const h1 = heading1(page);
  const [text, panel] = await h1.evaluate((el) => {
    let bg = "";
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      const m = /rgba?\(([^)]+)\)/.exec(c);
      const parts = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : [];
      if (parts.length >= 3 && (parts.length < 4 || parts[3] === 1)) {
        bg = c;
        break;
      }
    }
    return [getComputedStyle(el).color, bg];
  });
  const link = buyLink(page, title);
  const highlight = (await link.count()) > 0 ? await link.evaluate((el) => getComputedStyle(el).color) : null;
  return { panel, text, highlight };
}

/**
 * Every visible text node whose colour fails WCAG 1.4.3 against the background it sits on.
 * Backgrounds are composited up the ancestor chain; text that reaches a background image
 * before an opaque colour is reported, because the spec says text never sits on the artwork.
 */
async function contrastFailures(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const parse = (c: string): Rgba | null => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const lum = (c: Rgba) => {
      const ch = [c[0], c[1], c[2]].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const backgroundOf = (el: Element): Rgba | "image" => {
      const layers: Rgba[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.backgroundImage !== "none") return "image";
        const bg = parse(s.backgroundColor);
        if (bg && bg[3] > 0) layers.push(bg);
        if (bg && bg[3] >= 1) break;
      }
      let result: Rgba = [255, 255, 255, 1];
      for (const layer of layers.reverse()) result = over(layer, result);
      return result;
    };

    const failures: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const el = node.parentElement;
      if (!text || !el || el.closest("script, style, noscript, template")) continue;
      const s = getComputedStyle(el);
      if (s.visibility !== "visible" || parseFloat(s.opacity) === 0 || el.getClientRects().length === 0) continue;
      const fg = parse(s.color);
      const bg = backgroundOf(el);
      const label = `"${text.slice(0, 40)}"`;
      if (bg === "image") {
        failures.push(`${label} sits on a background image`);
        continue;
      }
      if (!fg) continue;
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      const needed = large ? 3 : 4.5;
      const r = ratio(over(fg, bg), bg);
      if (r < needed) failures.push(`${label} ${r.toFixed(2)}:1 < ${needed}:1 (${s.color} on rgb(${bg.slice(0, 3).join(", ")}))`);
    }
    return failures;
  });
}

async function hasHorizontalScrollbar(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

async function layoutDescription(page: Page): Promise<string> {
  const desc = page.locator('meta[name="description"]');
  return (await desc.count()) === 0 ? "" : ((await desc.first().getAttribute("content")) ?? "");
}

// ---------------------------------------------------------------- without client JS (#25)

test.describe("without client JS", () => {
  test.use({ javaScriptEnabled: false, viewport: VIEWPORTS[1440] });

  test("#1 #25 every seeded book's page is server-rendered with its title, by-line and tagline", async ({ page }) => {
    for (const b of seeded) {
      const response = await page.goto(URL_OF(b.slug));
      expect(response?.status(), `GET ${URL_OF(b.slug)}`).toBe(200);
      await expect(heading1(page), b.slug).toHaveText(b.title);
      await expect(byline(page, b.author), b.slug).toBeVisible();
      await expect(page.getByText(b.tagline, { exact: true }), b.slug).toBeVisible();
    }
  });

  test("#7 #25 sections render in order, each followed by its own field text", async ({ page }) => {
    const book = await openFixture(page);
    const found = await sections(page);
    expect(found.map((s) => s.heading)).toEqual([...SECTION_ORDER]);
    const fields = [book.about, book.whyPopular, book.whyItMatters, book.authorBio ?? ""];
    found.forEach((s, i) => expect(s.text, `text after "${s.heading}"`).toContain(fields[i]));
    // The next section's text must not appear before its own heading.
    found.slice(0, -1).forEach((s, i) => expect(s.text, `text after "${s.heading}"`).not.toContain(fields[i + 1]));
  });

  test("#12 #25 a valid https affiliateUrl renders a sponsored 'Buy {title}' link with the disclosure", async ({
    page,
  }) => {
    const book = await openFixture(page, { affiliateUrl: BUY_URL });
    const link = buyLink(page, book.title);
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", BUY_URL);
    expect((await link.getAttribute("rel")) ?? "").toMatch(/(^|\s)sponsored(\s|$)/);
    await expect(page.getByText(DISCLOSURE, { exact: true })).toBeVisible();
    await expect(page.getByText(COMING_SOON, { exact: true })).toHaveCount(0);
  });

  test("#22 #25 the first Tab focuses 'Back to the shop', which links to /", async ({ page }) => {
    await openFixture(page);
    await page.keyboard.press("Tab");
    await expect(backLink(page)).toBeFocused();
    await expect(backLink(page)).toHaveAttribute("href", "/");
  });
});

// ---------------------------------------------------------------- routing and status

test.describe("routing and status", () => {
  test("#2 every hotspot and sidebar link on / opens a 200 page whose <h1> is that book's title", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page
      .locator('a[href^="/books/"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    const unique = [...new Set(hrefs)];
    expect(unique, "precondition: / links to 25 books").toHaveLength(25);

    const titleBySlug = new Map(seeded.map((b) => [b.slug, b.title]));
    for (const href of unique) {
      const slug = href.replace(/^\/books\//, "");
      const response = await page.goto(href);
      expect(response?.status(), `GET ${href}`).toBe(200);
      await expect(heading1(page), href).toHaveText(titleBySlug.get(slug) ?? `(no seeded book for ${slug})`);
    }
  });

  test("#3 a book with displaySlot = null still has a 200 detail page", async ({ page }) => {
    const book = await openFixture(page);
    await expect(heading1(page)).toHaveText(book.title);
  });

  test("#4 #11 an unknown well-formed slug returns 404 with the not-found page, noindex and its title", async ({
    page,
  }) => {
    const response = await page.goto(URL_OF("no-such-book"));
    expect(response?.status()).toBe(404);
    await expect(heading1(page)).toHaveText(NOT_FOUND_HEADING);
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
    await expect(page).toHaveTitle("Book not found · Tree of Books");
  });

  for (const [why, slug] of [
    ["uppercase", "The-Hobbit"],
    ["percent-encoded space", "the%20hobbit"],
    ["leading -", "-the-hobbit"],
    ["trailing -", "the-hobbit-"],
    ["double --", "the--hobbit"],
    ["underscore", "the_hobbit"],
    ["dot inside", "the.hobbit"],
    ["over 100 characters", "a".repeat(101)],
  ] as const) {
    test(`#5 a malformed slug (${why}) returns 404 with the not-found page`, async ({ page }) => {
      const response = await page.goto(URL_OF(slug));
      expect(response?.status()).toBe(404);
      await expect(heading1(page)).toHaveText(NOT_FOUND_HEADING);
    });
  }
});

// ---------------------------------------------------------------- content

test.describe("content", () => {
  test("#8 empty and whitespace-only fields leave no heading and no empty element", async ({ page }) => {
    await openFixture(page, { tagline: "", about: "   \n\t ", authorBio: null });
    const headings = (await sections(page)).map((s) => s.heading);
    expect(headings).toEqual(["Why people are reading it", "Why it matters"]);
    expect(await emptyContentElements(page)).toEqual([]);
  });

  test("#8 an empty whyPopular and whyItMatters are left out too", async ({ page }) => {
    await openFixture(page, { whyPopular: "", whyItMatters: " " });
    expect((await sections(page)).map((s) => s.heading)).toEqual(["What it's about", "About the author"]);
    expect(await emptyContentElements(page)).toEqual([]);
  });

  test("#9 exactly one <h1>, and the section headings are <h2>", async ({ page }) => {
    await openFixture(page);
    await expect(page.locator("h1")).toHaveCount(1);
    for (const name of SECTION_ORDER) {
      await expect(page.getByRole("heading", { level: 2, name, exact: true }), name).toHaveCount(1);
    }
  });

  test("#10 summary and popularityRank are not visible; summary is only the meta description", async ({ page }) => {
    const book = await openFixture(page);
    const visible = await page.locator("body").innerText();
    expect(visible).not.toContain(book.summary);
    expect(visible).not.toContain(String(FIXTURE_RANK));
    expect(await layoutDescription(page)).toBe(book.summary);
  });

  test("#11 the document title is '{title} by {author} · Tree of Books'", async ({ page }) => {
    const book = await openFixture(page);
    await expect(page).toHaveTitle(`${book.title} by ${book.author} · Tree of Books`);
  });

  test("#11 with an empty summary, the meta description is the root layout's", async ({ page }) => {
    await page.goto("/");
    const rootDescription = await layoutDescription(page);
    expect(rootDescription, "precondition: the root layout has a description").not.toBe("");

    await openFixture(page, { summary: "" });
    expect(await layoutDescription(page)).toBe(rootDescription);
  });
});

// ---------------------------------------------------------------- buying link

test.describe("buying link", () => {
  for (const [why, affiliateUrl] of [
    ["the seed placeholder", "#affiliate-pending"],
    ["an http URL", "http://shop.example.com/buy/quiet-lantern"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a relative path", "/buy/quiet-lantern"],
    ["an empty string", ""],
  ] as const) {
    test(`#13 ${why} shows 'coming soon' and no buying link`, async ({ page }) => {
      const book = await openFixture(page, { affiliateUrl });
      await expect(page.getByText(COMING_SOON, { exact: true })).toBeVisible();
      await expect(buyLink(page, book.title)).toHaveCount(0);
      await expect(page.getByText(DISCLOSURE, { exact: true })).toHaveCount(0);
      await expect(page.locator('[href^="javascript:" i], [href^="#affiliate"]')).toHaveCount(0);
      if (affiliateUrl !== "") await expect(page.locator(`[href="${affiliateUrl}"]`)).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------- cover

test.describe("cover", () => {
  test("#14 with no coverImage, a decorative 2:3 placeholder cover shows the title and author", async ({ page }) => {
    const book = await openFixture(page, { coverImage: null });
    const cover = placeholderCover(page, book).first();
    await expect(cover).toBeVisible();
    const box = await boxOf(page, cover, "placeholder cover");
    expect(box.width / box.height).toBeCloseTo(2 / 3, 1);
    await expect(page.locator('img[src^="/covers/"]')).toHaveCount(0);
  });

  test("#15 a valid coverImage renders an <img> with alt 'Cover of {title}' and no placeholder", async ({ page }) => {
    const book = await openFixture(page, { coverImage: "/covers/the-hobbit.webp" });
    const img = page.locator('img[src="/covers/the-hobbit.webp"]');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute("alt", `Cover of ${book.title}`);
    await expect(placeholderCover(page, book)).toHaveCount(0);
  });

  for (const [why, coverImage] of [
    ["an absolute URL", "https://images.example.com/c.webp"],
    ["a protocol-relative URL", "//images.example.com/c.webp"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a path outside /covers/", "/images/c.webp"],
    ["a path with ..", "/covers/../secret.webp"],
  ] as const) {
    test(`#16 ${why} as coverImage shows the placeholder and no <img> for it`, async ({ page }) => {
      const book = await openFixture(page, { coverImage });
      await expect(placeholderCover(page, book).first()).toBeVisible();
      await expect(page.locator(`img[src="${coverImage}"]`)).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------- palette

test.describe("palette", () => {
  test("#17 a valid, readable palette drives the panel, the <h1> and the buying link", async ({ page }) => {
    expect(isReadable(READABLE), "precondition: READABLE passes the readability rule").toBe(true);
    const book = await openFixture(page, { palette: READABLE, affiliateUrl: BUY_URL });
    expect(await paletteColours(page, book.title)).toEqual({
      panel: hexToCss(READABLE.surface),
      text: hexToCss(READABLE.text),
      highlight: hexToCss(READABLE.highlight),
    });
  });

  test("#18 rejected palettes render exactly like palette = null, and their values never reach the HTML", async ({
    page,
  }) => {
    expect(isReadable(UNREADABLE), "precondition: UNREADABLE fails the readability rule").toBe(false);
    const book = await openFixture(page, { palette: null, affiliateUrl: BUY_URL });
    const defaults = await paletteColours(page, book.title);
    expect(defaults.highlight, "precondition: the buying link renders").not.toBeNull();

    const rejected: Array<[string, Record<string, string>, string[]]> = [
      ["a missing key", { primary: "#123456", surface: "#fedcba", text: "#0a0b0c" }, ["#123456", "#fedcba", "#0a0b0c"]],
      ["an extra key", { ...READABLE, accent: "#13579b" }, ["#13579b", READABLE.surface]],
      ["a non-hex value", { ...READABLE, surface: "red; background: url(x)" }, ["url(x)", READABLE.text]],
      ["an unreadable palette", { ...UNREADABLE }, Object.values(UNREADABLE)],
    ];
    for (const [why, palette, mustNotAppear] of rejected) {
      await openFixture(page, { palette, affiliateUrl: BUY_URL });
      expect(await paletteColours(page, book.title), why).toEqual(defaults);
      const html = (await page.content()).toLowerCase();
      for (const value of mustNotAppear) expect(html, `${why}: ${value} in the HTML`).not.toContain(value.toLowerCase());
    }
  });

  for (const [name, palette] of [
    ["the default palette", null],
    ["an accepted palette", READABLE],
  ] as const) {
    test(`#20 all visible text meets WCAG contrast with ${name}`, async ({ page }) => {
      await openFixture(page, { palette, affiliateUrl: BUY_URL });
      expect(await contrastFailures(page)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------- layout and accessibility

test.describe("layout and accessibility", () => {
  for (const width of [1440, 1024] as const) {
    test(`#21 at ${width}px the cover and the copy sit side by side, with no horizontal scrollbar`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[width]);
      const book = await openFixture(page);
      const cover = await boxOf(page, placeholderCover(page, book).first(), "cover");
      const title = await boxOf(page, heading1(page), "<h1>");
      const apart = cover.x + cover.width <= title.x + 1 || title.x + title.width <= cover.x + 1;
      expect(apart, `cover ${JSON.stringify(cover)} vs h1 ${JSON.stringify(title)}`).toBe(true);
      const verticalOverlap = cover.y < title.y + title.height && title.y < cover.y + cover.height;
      expect(verticalOverlap, "cover and <h1> share a row").toBe(true);
      expect(await hasHorizontalScrollbar(page)).toBe(false);
    });
  }

  for (const width of [768, 375] as const) {
    test(`#21 at ${width}px the cover is above the copy, with no horizontal scrollbar`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[width]);
      const book = await openFixture(page);
      const cover = await boxOf(page, placeholderCover(page, book).first(), "cover");
      const title = await boxOf(page, heading1(page), "<h1>");
      expect(cover.y + cover.height, "cover bottom ≤ h1 top").toBeLessThanOrEqual(title.y + 1);
      expect(await hasHorizontalScrollbar(page)).toBe(false);
    });
  }

  test("#22 every link shows a visible focus indicator when reached with Tab", async ({ page }) => {
    await openFixture(page, { affiliateUrl: BUY_URL });
    const linkCount = await page.locator("a[href]").count();
    expect(linkCount, "precondition: back link and buying link").toBeGreaterThanOrEqual(2);

    type Style = { outline: string; boxShadow: string; decoration: string; background: string };

    const focused = new Map<number, { name: string; style: Style }>();
    for (let i = 0; i < linkCount + 5 && focused.size < linkCount; i++) {
      await page.keyboard.press("Tab");
      const hit = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el.tagName !== "A") return null;
        const s = getComputedStyle(el);
        return {
          index: Array.from(document.querySelectorAll("a[href]")).indexOf(el),
          name: (el.textContent ?? "").trim(),
          style: {
            outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
            boxShadow: s.boxShadow,
            decoration: `${s.textDecorationLine} ${s.textDecorationColor}`,
            background: s.backgroundColor,
          },
        };
      });
      if (hit) focused.set(hit.index, { name: hit.name, style: hit.style });
    }
    expect(focused.size, "Tab reaches every link").toBe(linkCount);

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (const [index, { name, style }] of focused) {
      const resting: Style = await page
        .locator("a[href]")
        .nth(index)
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
            boxShadow: s.boxShadow,
            decoration: `${s.textDecorationLine} ${s.textDecorationColor}`,
            background: s.backgroundColor,
          };
        });
      expect(style, `${name}: focused style differs from resting`).not.toEqual(resting);
      const hasRing = !style.outline.startsWith("none") && !/ 0px /.test(style.outline);
      expect(hasRing || style.boxShadow !== "none", `${name}: has an outline or box-shadow ring`).toBe(true);
    }
  });

  test("#23 with the backdrop image blocked, all content renders and contrast still passes", async ({ page }) => {
    let blocked = 0;
    await page.route("**/bookshop/scene@*", (route) => {
      blocked++;
      return route.abort();
    });
    const book = await openFixture(page, { affiliateUrl: BUY_URL });
    expect(blocked, "precondition: the page requests the bookshop artwork").toBeGreaterThan(0);
    await expect(heading1(page)).toHaveText(book.title);
    expect((await sections(page)).map((s) => s.heading)).toEqual([...SECTION_ORDER]);
    await expect(buyLink(page, book.title)).toBeVisible();
    expect(await contrastFailures(page)).toEqual([]);
  });

  test("#24 with reduced motion, nothing on the page has a transition or animation duration", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const book = await openFixture(page, { affiliateUrl: BUY_URL });
    await buyLink(page, book.title).hover();
    const moving = await page.evaluate(() => {
      const nonZero = (list: string) => list.split(",").some((v) => parseFloat(v) > 0);
      return Array.from(document.body.querySelectorAll("*"))
        .filter((el) => el.tagName.toLowerCase() !== "nextjs-portal")
        .filter((el) => {
          const s = getComputedStyle(el);
          return nonZero(s.transitionDuration) || (s.animationName !== "none" && nonZero(s.animationDuration));
        })
        .map((el) => el.outerHTML.slice(0, 120));
    });
    expect(moving).toEqual([]);
  });
});
