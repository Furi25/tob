// Spec: docs/specs/book-detail-open-book.md
// Criteria covered here: #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #16 #18 #19 #20 #21 #22 #24 #25 #26 #27
// Covered in Vitest instead: #14 #15 (palette rule, PARCHMENT) and the file half of #16/#17 — see
// src/server/books.open-book.test.ts and src/components/book/openBook.test.ts.
// Not covered: #23 (axe). @axe-core/playwright is not a dependency, and axe cannot judge text over images;
// palette contrast is asserted by #14 and by the "unblocked image" check in #18.
//
// Selectors rely on roles and the spec's wording, not on class names or test ids:
//   - the "window" is the book image: an <img> whose URL contains /book/open-book, alt=""
//   - the text pane is the only role="region" whose name contains the title
// Preconditions: as tests/e2e/book-detail-page.spec.ts (shared test database, one fixture book).
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { FIXTURE_SLUG, putFixture, removeFixture, type FixtureBook } from "./support/book-fixtures";
import { prisma, reseed } from "./support/db";

const FIXTURE_URL = `/books/${FIXTURE_SLUG}`;
const BUY_URL = "https://shop.example.com/buy/quiet-lantern?ref=tob";
const DISCLOSURE = "We may earn a commission if you buy through this link.";
const COMING_SOON = "Buying links are coming soon.";
const SECTION_ORDER = ["What it's about", "Why people are reading it", "Why it matters", "About the author"] as const;
const BOOK_IMG = 'img[src*="/book/open-book"], img[srcset*="/book/open-book"]';

const NEW_READABLE = { primary: "#5a2a0a", surface: "#fff6dc", text: "#2a1a0a", highlight: "#7a2e0a" };
const OLD_DARK = { primary: "#b68953", surface: "#2b1c12", text: "#f3e3c3", highlight: "#ffd590" };

const BOOK_SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
] as const;

const LONG_TEXT = "The lantern swung gently as the porter climbed another dark staircase. ".repeat(300); // > 20,000 chars
const LONG_TITLE = "Quiet".repeat(20); // 100 characters, no break opportunities
const LONG_AUTHOR = `${"Imogen".repeat(16)}Test`; // 100 characters

test.beforeAll(async () => {
  reseed();
});

test.afterAll(async () => {
  await removeFixture();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- helpers

type Box = { x: number; y: number; width: number; height: number };

const bookImage = (page: Page) => page.locator(BOOK_IMG).first();
const pane = (page: Page, title: string) => page.getByRole("region", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
const backLink = (page: Page) => page.getByRole("link", { name: "Back to the shop", exact: true });
const buyLink = (page: Page, title: string) => page.getByRole("link", { name: `Buy ${title}`, exact: true });

async function box(locator: Locator, what: string): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${what} has no layout box`);
  return b;
}

async function openFixture(page: Page, overrides: Partial<FixtureBook> = {}, size?: { width: number; height: number }) {
  const book = await putFixture(overrides);
  if (size) await page.setViewportSize(size);
  const response = await page.goto(FIXTURE_URL);
  expect(response?.status(), `GET ${FIXTURE_URL}`).toBe(200);
  return book;
}

const docOverflow = (page: Page) =>
  page.evaluate(() => ({
    vScroll: document.documentElement.scrollHeight - window.innerHeight,
    hScroll: document.documentElement.scrollWidth - window.innerWidth,
    bodyV: document.body.scrollHeight - window.innerHeight,
    scrollY: window.scrollY,
  }));

async function expectNoDocumentScroll(page: Page, label: string) {
  const o = await docOverflow(page);
  expect(o.vScroll, `${label}: documentElement vertical overflow`).toBeLessThanOrEqual(0);
  expect(o.hScroll, `${label}: documentElement horizontal overflow`).toBeLessThanOrEqual(0);
  expect(o.bodyV, `${label}: body vertical overflow`).toBeLessThanOrEqual(0);
}

const inside = (inner: Box, outer: Box, tolerance = 1) =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.width <= outer.x + outer.width + tolerance &&
  inner.y + inner.height <= outer.y + outer.height + tolerance;

/** h1 colour, buy button colours, chapter label colour and placeholder-cover colours, as computed by Chromium. */
async function colours(page: Page, title: string) {
  const h1 = await page.getByRole("heading", { level: 1 }).evaluate((el) => getComputedStyle(el).color);
  const buy = buyLink(page, title);
  const buyColours =
    (await buy.count()) > 0
      ? await buy.evaluate((el) => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }))
      : null;
  const label = page.locator("h2").first().locator("*").filter({ hasText: /^Chapter [IVXL]+$/ }).first();
  const labelColour = (await label.count()) > 0 ? await label.evaluate((el) => getComputedStyle(el).color) : null;
  return { h1, buy: buyColours, label: labelColour };
}

async function coverColours(page: Page, primary: string) {
  return page.evaluate((wanted) => {
    const toRgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const target = toRgb(wanted);
    const hit = Array.from(document.querySelectorAll('[aria-hidden="true"]')).find(
      (el) => getComputedStyle(el).backgroundColor === target,
    );
    return hit ? { background: getComputedStyle(hit).backgroundColor, color: getComputedStyle(hit).color } : null;
  }, primary);
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

// ---------------------------------------------------------------- layout and scrolling (#1 #2 #3)

test.describe("window and scrolling", () => {
  test("#1 #2 #3: no document scroll, centred window, correct ratio, inside the viewport — on every seeded book", async ({ page }) => {
    test.setTimeout(300_000);
    const slugs = (await prisma.book.findMany({ where: { slug: { not: FIXTURE_SLUG } }, select: { slug: true }, orderBy: { slug: "asc" } })).map((b) => b.slug);
    expect(slugs.length, "precondition: the seed creates at least 25 books").toBeGreaterThanOrEqual(25);
    for (const slug of slugs) {
      await page.setViewportSize(BOOK_SIZES[0]);
      const response = await page.goto(`/books/${slug}`);
      expect(response?.status(), slug).toBe(200);
      const img = bookImage(page);
      await expect(img, `${slug}: the open-book image`).toBeVisible();
      await img.evaluate((el: HTMLImageElement) => el.decode());
      for (const size of BOOK_SIZES) {
        await page.setViewportSize(size);
        const label = `${slug} @ ${size.width}x${size.height}`;
        await expectNoDocumentScroll(page, label);
        const b = await box(img, label);
        expect(Math.abs(b.x + b.width / 2 - size.width / 2), `${label}: horizontal centre`).toBeLessThanOrEqual(2);
        expect(Math.abs(b.y + b.height / 2 - size.height / 2), `${label}: vertical centre (chrome may shift it)`).toBeLessThanOrEqual(size.height * 0.1);
        expect(b.x, `${label}: inside left`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${label}: inside top`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${label}: inside right`).toBeLessThanOrEqual(size.width + 0.5);
        expect(b.y + b.height, `${label}: inside bottom`).toBeLessThanOrEqual(size.height + 0.5);
        const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight);
        expect(b.width / b.height, `${label}: aspect ratio equals the image's`).toBeCloseTo(natural, 1);
      }
    }
  });

  test("#2: at 1920x1080 the shop backdrop stays visible on both sides of the book", async ({ page }) => {
    await openFixture(page, {}, { width: 1920, height: 1080 });
    const b = await box(bookImage(page), "book image");
    expect(b.x, "free space left of the book").toBeGreaterThan(40);
    expect(1920 - (b.x + b.width), "free space right of the book").toBeGreaterThan(40);
  });

  test("#4: with 20,000+ characters the document still does not scroll; only the pane scrolls (wheel and keyboard)", async ({ page }) => {
    const book = await openFixture(page, { about: LONG_TEXT }, BOOK_SIZES[0]);
    expect(book.about.length).toBeGreaterThanOrEqual(20_000);
    await expectNoDocumentScroll(page, "long text");
    const region = pane(page, book.title);
    await expect(region).toHaveCount(1);
    const metrics = await region.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    const b = await box(region, "pane");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => region.evaluate((el) => el.scrollTop), { message: "scrollTop after wheel" }).toBeGreaterThan(0);

    const before = await region.evaluate((el) => el.scrollTop);
    await region.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => region.evaluate((el) => el.scrollTop), { message: "scrollTop after PageDown" }).toBeGreaterThan(before);
    await expectNoDocumentScroll(page, "after scrolling the pane");
  });

  test("#5: with short text the pane does not scroll and shows no scrollbar", async ({ page }) => {
    const book = await openFixture(page, {}, BOOK_SIZES[0]);
    const region = pane(page, book.title);
    const m = await region.evaluate((el) => ({
      overflow: el.scrollHeight - el.clientHeight,
      scrollbar: (el as HTMLElement).offsetWidth - el.clientWidth - (parseFloat(getComputedStyle(el).borderLeftWidth) + parseFloat(getComputedStyle(el).borderRightWidth)),
    }));
    expect(m.overflow, "pane overflow").toBeLessThanOrEqual(1);
    expect(m.scrollbar, "scrollbar width").toBeLessThanOrEqual(0);
  });

  test("#6: scrolling the pane moves neither the document nor the left page (title, buy button)", async ({ page }) => {
    const book = await openFixture(page, { about: LONG_TEXT, affiliateUrl: BUY_URL }, BOOK_SIZES[0]);
    const h1 = page.getByRole("heading", { level: 1 });
    const buy = buyLink(page, book.title);
    const [h1Before, buyBefore] = [await box(h1, "h1"), await box(buy, "buy link")];
    const region = pane(page, book.title);
    const b = await box(region, "pane");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.wheel(0, 800);
    await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const [h1After, buyAfter] = [await box(h1, "h1"), await box(buy, "buy link")];
    expect(h1After).toEqual(h1Before);
    expect(buyAfter).toEqual(buyBefore);
    expect((await docOverflow(page)).scrollY).toBe(0);
  });

  test("#7: a 100-character title and author stay inside the book image", async ({ page }) => {
    const book = await openFixture(
      page,
      { title: LONG_TITLE, author: LONG_AUTHOR, affiliateUrl: BUY_URL, about: LONG_TEXT },
      BOOK_SIZES[1],
    );
    await expectNoDocumentScroll(page, "long title");
    const image = await box(bookImage(page), "book image");
    const targets: Array<[string, Locator]> = [
      ["h1", page.getByRole("heading", { level: 1 })],
      ["byline", page.getByText(`by ${LONG_AUTHOR}`, { exact: true })],
      ["tagline", page.getByText(book.tagline, { exact: true })],
      ["buy link", buyLink(page, LONG_TITLE)],
      ["disclosure", page.getByText(DISCLOSURE, { exact: true })],
      ["text pane", pane(page, LONG_TITLE)],
    ];
    for (const [what, locator] of targets) {
      expect(inside(await box(locator, what), image), `${what} lies inside the book image`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- content in the new markup (#8 #9 #10 #11)

test.describe("content", () => {
  test("#8: one h1, the four h2s in order, each followed by its text; empty sections and empty tagline are not rendered", async ({ page }) => {
    const book = await openFixture(page, {}, BOOK_SIZES[0]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(book.title);
    const names = await page.getByRole("heading", { level: 2 }).evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    expect(names.length).toBe(4);
    for (const [i, name] of SECTION_ORDER.entries()) {
      await expect(page.getByRole("heading", { level: 2, name, exact: true })).toHaveCount(1);
      expect(names[i]).toContain(name);
    }
    await expect(page.getByText(book.about, { exact: true })).toBeVisible();

    await putFixture({ whyPopular: "   ", authorBio: null, tagline: "" });
    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);
    await expect(page.getByRole("heading", { level: 2, name: "Why people are reading it" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "About the author" })).toHaveCount(0);
  });

  test("#8: the buy link, disclosure and coming-soon wording are unchanged", async ({ page }) => {
    const book = await openFixture(page, { affiliateUrl: BUY_URL }, BOOK_SIZES[0]);
    const buy = buyLink(page, book.title);
    await expect(buy).toHaveAttribute("href", BUY_URL);
    await expect(buy).toHaveAttribute("rel", /sponsored/);
    await expect(page.getByText(DISCLOSURE, { exact: true })).toBeVisible();

    await putFixture({ affiliateUrl: "#affiliate-pending" });
    await page.goto(FIXTURE_URL);
    await expect(page.getByText(COMING_SOON, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Buy / })).toHaveCount(0);
  });

  test("#8: an unknown slug returns 404 inside the same book window, with a link to /", async ({ page }) => {
    await page.setViewportSize(BOOK_SIZES[0]);
    const response = await page.goto("/books/no-such-book");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "We couldn't find that book." })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
    await expect(page.getByRole("link", { name: /shop|home|back/i }).first()).toHaveAttribute("href", "/");
    await expect(bookImage(page), "404 uses the book window too").toBeVisible();
    await expectNoDocumentScroll(page, "404 page");
  });

  test("#9: chapter labels follow the rendered order with no gap when a section is empty", async ({ page }) => {
    await openFixture(page, { whyPopular: "", authorBio: "Someone wrote this." }, BOOK_SIZES[0]);
    const headings = page.getByRole("heading", { level: 2 });
    await expect(headings).toHaveCount(3);
    const labels = await headings.evaluateAll((els) =>
      els.map((e) => /Chapter\s+([IVXL]+)/.exec((e as HTMLElement).innerText)?.[1] ?? null),
    );
    expect(labels).toEqual(["I", "II", "III"]);
  });

  test("#9: the chapter label is decorative: the heading's accessible name is only its own text", async ({ page }) => {
    await openFixture(page, {}, BOOK_SIZES[0]);
    for (const name of SECTION_ORDER) {
      await expect(page.getByRole("heading", { level: 2, name, exact: true }), `h2 "${name}" has exactly that accessible name`).toHaveCount(1);
    }
  });

  test("#10: blank-line separated paragraphs render one <p> each; a single paragraph renders one <p>", async ({ page }) => {
    await openFixture(page, { about: "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.", whyPopular: "Only one paragraph here." }, BOOK_SIZES[0]);
    const count = (heading: string) =>
      page.getByRole("heading", { level: 2, name: heading, exact: true }).evaluate((h) => (h.closest("section") ?? h.parentElement)!.querySelectorAll("p").length);
    expect(await count("What it's about")).toBe(3);
    expect(await count("Why people are reading it")).toBe(1);
  });

  test("#11: a book with no cover shows an aria-hidden placeholder in the palette's primary and surface colours", async ({ page }) => {
    await openFixture(page, { coverImage: null, palette: NEW_READABLE }, BOOK_SIZES[0]);
    const cover = await coverColours(page, NEW_READABLE.primary);
    expect(cover, "an aria-hidden element with background = primary").not.toBeNull();
    expect(cover!.color).toBe(rgb(NEW_READABLE.surface));
  });

  test("#11: a valid coverImage renders an <img> with alt 'Cover of {title}'", async ({ page }) => {
    const book = await openFixture(page, { coverImage: "/covers/the-hobbit.webp" }, BOOK_SIZES[0]);
    await expect(page.getByRole("img", { name: `Cover of ${book.title}` })).toHaveAttribute("src", "/covers/the-hobbit.webp");
  });
});

// ---------------------------------------------------------------- palette (#12 #13)

test.describe("palette roles", () => {
  test("#12: h1 = text, chapter label = highlight, buy button background = primary, buy text = surface", async ({ page }) => {
    const book = await openFixture(page, { palette: NEW_READABLE, affiliateUrl: BUY_URL }, BOOK_SIZES[0]);
    const c = await colours(page, book.title);
    expect(c.h1).toBe(rgb(NEW_READABLE.text));
    expect(c.label, "chapter label element").toBe(rgb(NEW_READABLE.highlight));
    expect(c.buy?.background).toBe(rgb(NEW_READABLE.primary));
    expect(c.buy?.color).toBe(rgb(NEW_READABLE.surface));
  });

  test("#13: rejected palettes render the default colours, and the default is a dark-ink parchment palette", async ({ page }) => {
    const base = await openFixture(page, { palette: null, affiliateUrl: BUY_URL }, BOOK_SIZES[0]);
    const def = await colours(page, base.title);
    expect(def.h1, "default h1 is not the old light text").not.toBe(rgb(OLD_DARK.text));
    expect(def.buy?.background, "default buy button is not the old brass").not.toBe(rgb(OLD_DARK.primary));

    const bad: Array<[string, unknown]> = [
      ["old dark-surface palette", OLD_DARK],
      ["missing key", { primary: NEW_READABLE.primary, surface: NEW_READABLE.surface, text: NEW_READABLE.text }],
      ["extra key", { ...NEW_READABLE, extra: "#000000" }],
      ["non-hex value", { ...NEW_READABLE, text: "red; background: url(x)" }],
      ["low contrast on parchment", { ...NEW_READABLE, text: "#b8a070", highlight: "#c8b080" }],
    ];
    for (const [why, palette] of bad) {
      await putFixture({ palette: palette as FixtureBook["palette"], affiliateUrl: BUY_URL });
      await page.goto(FIXTURE_URL);
      expect(await colours(page, base.title), why).toEqual(def);
      const html = await page.content();
      expect(html, `${why}: rejected value must not appear in the HTML`).not.toContain("url(x)");
    }
  });
});

// ---------------------------------------------------------------- asset (#16 #18 #19)

test.describe("book image and backdrop", () => {
  test("#16: the window is a WebP from /book/ with real alpha and no colour-key or tint filter", async ({ page }) => {
    await openFixture(page, {}, BOOK_SIZES[0]);
    const img = bookImage(page);
    await expect(img).toBeVisible();
    expect(await img.getAttribute("alt")).toBe("");
    const src = await img.evaluate((el: HTMLImageElement) => el.currentSrc);
    expect(new URL(src).pathname).toMatch(/^\/book\/open-book@v1-\d+\.webp$/);
    const res = await page.request.get(src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/webp");

    const filters = await img.evaluate((el) => {
      const out: string[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) out.push(getComputedStyle(e).filter);
      return out.join(" | ");
    });
    expect(filters, "no SVG colour-key filter").not.toMatch(/url\(/);
    expect(filters, "no per-book tint").not.toMatch(/grayscale|sepia|hue-rotate|saturate|contrast|brightness/);
    expect(await page.content()).not.toContain("key-checker");
  });

  test("#18: with the book image blocked, text stays readable on a page background and the page does not scroll", async ({ page }) => {
    await page.route(/\/book\/open-book/, (route) => route.abort());
    const book = await openFixture(page, { about: LONG_TEXT }, BOOK_SIZES[0]);
    await expect(page.getByRole("heading", { level: 1, name: book.title })).toBeVisible();
    await expectNoDocumentScroll(page, "image blocked");
    const verdict = await page.getByRole("heading", { level: 1 }).evaluate((el) => {
      const parse = (c: string) => (/rgba?\(([^)]+)\)/.exec(c)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number)) ?? [];
      const lum = ([r, g, b]: number[]) => {
        const [R, G, B] = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * R + 0.7152 * G + 0.0722 * B;
      };
      let bg: number[] | null = null;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const p = parse(getComputedStyle(e).backgroundColor);
        if (p.length >= 3 && (p.length < 4 || p[3] === 1)) {
          bg = p;
          break;
        }
      }
      const fg = parse(getComputedStyle(el).color);
      if (!bg) return { ratio: 0 };
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return { ratio: (hi + 0.05) / (lo + 0.05) };
    });
    expect(verdict.ratio, "h1 contrast against the opaque background behind it").toBeGreaterThanOrEqual(4.5);
  });

  test("#19: with the backdrop blocked, the page still renders and does not scroll", async ({ page }) => {
    await page.route(/\/bookshop\//, (route) => route.abort());
    const book = await openFixture(page, {}, BOOK_SIZES[0]);
    await expect(page.getByRole("heading", { level: 1, name: book.title })).toBeVisible();
    await expect(bookImage(page)).toBeVisible();
    await expectNoDocumentScroll(page, "backdrop blocked");
  });
});

// ---------------------------------------------------------------- accessibility (#20 #21 #22 #24)

test.describe("accessibility and motion", () => {
  test("#20: Tab order is back link, buy link, text pane; each shows a visible focus indicator", async ({ page }) => {
    const book = await openFixture(page, { affiliateUrl: BUY_URL, about: LONG_TEXT }, BOOK_SIZES[0]);
    const focusInfo = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const s = getComputedStyle(el);
        const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
        return { text: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 60), href: el.getAttribute("href"), visible: outline || s.boxShadow !== "none" };
      });

    await page.keyboard.press("Tab");
    const first = await focusInfo();
    expect(first?.text).toBe("Back to the shop");
    expect(first?.href).toBe("/");
    expect(first?.visible, "back link focus indicator").toBe(true);

    await page.keyboard.press("Tab");
    const second = await focusInfo();
    expect(second?.text).toBe(`Buy ${book.title}`);
    expect(second?.visible, "buy link focus indicator").toBe(true);

    await page.keyboard.press("Tab");
    const third = await focusInfo();
    expect(third?.text, "the pane is the next stop").toContain(book.title);
    expect(third?.visible, "pane focus indicator").toBe(true);
  });

  test("#21: the text pane is a labelled region that is keyboard-focusable", async ({ page }) => {
    const book = await openFixture(page, {}, BOOK_SIZES[0]);
    const region = pane(page, book.title);
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute("tabindex", "0");
  });

  test("#22: the running header is aria-hidden and the book image is decorative", async ({ page }) => {
    const book = await openFixture(page, {}, BOOK_SIZES[0]);
    await expect(page.locator('[aria-hidden="true"]').filter({ hasText: `${book.title} · ${book.author}` }).first()).toBeAttached();
    await expect(bookImage(page)).toHaveAttribute("alt", "");
  });

  test("#24: with reduced motion nothing animates or transitions; without it, something does", async ({ page }) => {
    await openFixture(page, { affiliateUrl: BUY_URL }, BOOK_SIZES[0]);
    const scan = () =>
      page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("body *")).map((el) => getComputedStyle(el));
        return {
          animated: all.filter((s) => s.animationName !== "none" && s.animationDuration !== "0s").length,
          transitioned: all.filter((s) => s.transitionProperty !== "all" || s.transitionDuration !== "0s").filter((s) => s.transitionDuration.split(",").some((d) => parseFloat(d) > 0)).length,
        };
      });
    const normal = await scan();
    expect(normal.animated + normal.transitioned, "motion exists when not reduced (control)").toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(FIXTURE_URL);
    const reduced = await scan();
    expect(reduced.animated, "elements with a running animation").toBe(0);
    expect(reduced.transitioned, "elements with a transition").toBe(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

// ---------------------------------------------------------------- small screens (#25 #26)

test.describe("small screens and short windows", () => {
  for (const size of [
    { width: 699, height: 900 },
    { width: 375, height: 667 },
    { width: 1024, height: 479 },
  ]) {
    test(`#25: at ${size.width}x${size.height} no book image, one column in the old order, no horizontal overflow, page scrolls vertically`, async ({ page }) => {
      const book = await openFixture(page, { about: LONG_TEXT, affiliateUrl: BUY_URL }, size);
      await expect(page.locator(BOOK_IMG).first()).not.toBeVisible();
      const o = await docOverflow(page);
      expect(o.hScroll, "horizontal overflow").toBeLessThanOrEqual(0);
      expect(o.vScroll, "the page can scroll vertically").toBeGreaterThan(0);

      const h1 = await box(page.getByRole("heading", { level: 1 }), "h1");
      const firstH2 = await box(page.getByRole("heading", { level: 2 }).first(), "first h2");
      const buy = await box(buyLink(page, book.title), "buy link");
      expect(h1.y, "title before the sections").toBeLessThan(firstH2.y);
      expect(firstH2.y, "sections before the buy block").toBeLessThan(buy.y);
      expect(Math.abs(h1.x - firstH2.x), "single column: title and sections share a left edge").toBeLessThan(size.width * 0.35);
    });
  }

  for (const size of [
    { width: 700, height: 900 },
    { width: 1024, height: 480 },
  ]) {
    test(`#26: at ${size.width}x${size.height} the book layout shows and the document does not scroll`, async ({ page }) => {
      await openFixture(page, { about: LONG_TEXT }, size);
      await expect(bookImage(page)).toBeVisible();
      await expectNoDocumentScroll(page, `${size.width}x${size.height}`);
    });
  }
});

// ---------------------------------------------------------------- no JavaScript (#27)

test.describe("without JavaScript", () => {
  async function noJsPage(browser: Browser) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: BOOK_SIZES[0] });
    return { context, page: await context.newPage() };
  }

  test("#27: the book window, title, sections, buy link and back link all render", async ({ browser }) => {
    const book = await putFixture({ affiliateUrl: BUY_URL });
    const { context, page } = await noJsPage(browser);
    try {
      const response = await page.goto(FIXTURE_URL);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: book.title })).toBeVisible();
      for (const name of SECTION_ORDER) await expect(page.getByRole("heading", { level: 2, name, exact: true })).toHaveCount(1);
      await expect(buyLink(page, book.title)).toHaveAttribute("href", BUY_URL);
      await expect(backLink(page)).toHaveAttribute("href", "/");
      const image = await box(bookImage(page), "book image");
      expect(image.x + image.width).toBeLessThanOrEqual(BOOK_SIZES[0].width + 0.5);
      expect(image.y + image.height).toBeLessThanOrEqual(BOOK_SIZES[0].height + 0.5);
    } finally {
      await context.close();
    }
  });
});
