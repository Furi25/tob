// Spec: docs/specs/book-detail-open-book.md — criteria #13, #14, #15 (palette half) and Data Model
//
// Interface these tests rely on (named in the spec; PARCHMENT's value comes from the cleaned asset):
//   src/server/books.ts exports
//     - PARCHMENT        "#rrggbb", darkest paper tone under the text areas (contrast baseline)
//     - DEFAULT_PALETTE  parchment palette: text/highlight read on PARCHMENT, surface reads on primary
//     - getBookBySlug    unchanged signature; palette is validated by the new rule
// The readability rule under test (spec → Data Model):
//   contrast(text, PARCHMENT) >= 4.5, contrast(highlight, PARCHMENT) >= 4.5, contrast(surface, primary) >= 4.5
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contrastRatio } from "../../tests/support/contrast";

const db = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { book: { findUnique: db.findUnique } } }));

import * as books from "./books";
import { DEFAULT_PALETTE, getBookBySlug } from "./books";

const PARCHMENT = (books as Record<string, unknown>).PARCHMENT as string;

type Palette = { primary: string; surface: string; text: string; highlight: string };

const row = (palette: unknown) => ({
  slug: "the-quiet-lantern",
  title: "The Quiet Lantern",
  author: "Imogen Testwell",
  tagline: "A small light.",
  summary: "Summary.",
  about: "About.",
  whyPopular: "Popular.",
  whyItMatters: "Matters.",
  authorBio: null,
  affiliateUrl: "#affiliate-pending",
  coverImage: null,
  palette,
});

async function paletteOf(stored: unknown): Promise<Palette> {
  db.findUnique.mockResolvedValue(row(stored));
  const book = await getBookBySlug("the-quiet-lantern");
  if (!book) throw new Error("loader returned null for a stored row");
  return book.palette;
}

const grey = (n: number) => `#${n.toString(16).padStart(2, "0").repeat(3)}`;

/** The two neighbouring greys on either side of the 4.5:1 line against `against` (dark side passes). */
function boundaryAround(against: string): { passing: string; failing: string } {
  for (let n = 0; n < 255; n++) {
    if (contrastRatio(grey(n), against) >= 4.5 && contrastRatio(grey(n + 1), against) < 4.5) {
      return { passing: grey(n), failing: grey(n + 1) };
    }
  }
  throw new Error(`no grey crosses 4.5:1 against ${against}`);
}

const GOOD: Palette = { primary: "#5a2a0a", surface: "#fff6dc", text: "#2a1a0a", highlight: "#7a2e0a" };

beforeEach(() => db.findUnique.mockReset());

describe("PARCHMENT (#15, Data Model)", () => {
  it("is exported as a #rrggbb colour", () => {
    expect(PARCHMENT, "PARCHMENT export from src/server/books.ts").toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("is a light paper tone, not a dark panel colour", () => {
    expect(contrastRatio(PARCHMENT, "#000000")).toBeGreaterThan(7);
  });
});

describe("DEFAULT_PALETTE under the parchment rule (#14)", () => {
  it("has exactly primary, surface, text and highlight as #rrggbb", () => {
    expect(Object.keys(DEFAULT_PALETTE).sort()).toEqual(["highlight", "primary", "surface", "text"]);
    for (const value of Object.values(DEFAULT_PALETTE)) expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("reads on the parchment: text and highlight reach 4.5:1 against PARCHMENT", () => {
    expect(contrastRatio(DEFAULT_PALETTE.text, PARCHMENT), "text on parchment").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DEFAULT_PALETTE.highlight, PARCHMENT), "highlight on parchment").toBeGreaterThanOrEqual(4.5);
  });

  it("letters on the plate: surface on primary reaches 4.5:1", () => {
    expect(contrastRatio(DEFAULT_PALETTE.surface, DEFAULT_PALETTE.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it("is a dark-ink palette, not the old light-text-on-dark default", () => {
    expect(contrastRatio(DEFAULT_PALETTE.text, "#000000")).toBeLessThan(contrastRatio(DEFAULT_PALETTE.text, "#ffffff"));
  });
});

describe("the readability rule through getBookBySlug (#13, #14)", () => {
  it("accepts a palette that satisfies the rule", async () => {
    expect(await paletteOf(GOOD)).toEqual(GOOD);
  });

  it("falls back to DEFAULT_PALETTE for the old dark-surface default (light text on a dark surface)", async () => {
    const oldDefault: Palette = { primary: "#b68953", surface: "#2b1c12", text: "#f3e3c3", highlight: "#ffd590" };
    expect(await paletteOf(oldDefault)).toEqual(DEFAULT_PALETTE);
  });

  it("falls back when text is just under 4.5:1 on PARCHMENT, and accepts it just over", async () => {
    const { passing, failing } = boundaryAround(PARCHMENT);
    expect(await paletteOf({ ...GOOD, text: passing })).toEqual({ ...GOOD, text: passing });
    expect(await paletteOf({ ...GOOD, text: failing })).toEqual(DEFAULT_PALETTE);
  });

  it("falls back when highlight is just under 4.5:1 on PARCHMENT, and accepts it just over", async () => {
    const { passing, failing } = boundaryAround(PARCHMENT);
    expect(await paletteOf({ ...GOOD, highlight: passing })).toEqual({ ...GOOD, highlight: passing });
    expect(await paletteOf({ ...GOOD, highlight: failing })).toEqual(DEFAULT_PALETTE);
  });

  it("falls back when lettering on the plate is just under 4.5:1, and accepts it just over", async () => {
    const primary = "#000000";
    // The lightest grey surface that still passes against black is the boundary; scan from the dark end.
    let failing = grey(0);
    let passing = grey(255);
    for (let n = 0; n < 255; n++) {
      if (contrastRatio(grey(n), primary) < 4.5 && contrastRatio(grey(n + 1), primary) >= 4.5) {
        failing = grey(n);
        passing = grey(n + 1);
        break;
      }
    }
    expect(await paletteOf({ ...GOOD, primary, surface: passing })).toEqual({ ...GOOD, primary, surface: passing });
    expect(await paletteOf({ ...GOOD, primary, surface: failing })).toEqual(DEFAULT_PALETTE);
  });

  it.each([
    ["null", null],
    ["a missing key", { primary: GOOD.primary, surface: GOOD.surface, text: GOOD.text }],
    ["an extra key", { ...GOOD, extra: "#000000" }],
    ["a non-hex value", { ...GOOD, text: "red; background: url(x)" }],
    ["a short hex value", { ...GOOD, text: "#222" }],
    ["a non-object", "#2a1a0a"],
  ])("falls back to DEFAULT_PALETTE for %s", async (_why, stored) => {
    expect(await paletteOf(stored)).toEqual(DEFAULT_PALETTE);
  });
});
