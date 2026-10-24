// Spec: docs/specs/book-detail-page.md — criteria #5, #6, #19
//
// Interface these tests rely on (the spec names the module and the loader; the two
// other export names are the tester's choice and should be recorded in the spec):
//   src/server/books.ts exports
//     - slugSchema       Zod schema for the [slug] route param
//     - DEFAULT_PALETTE  { primary, surface, text, highlight } as #rrggbb
//     - getBookBySlug    the server data loader
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contrastRatio, isReadable } from "../../tests/support/contrast";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { book: { findUnique: db.findUnique, findFirst: db.findFirst } } }));

import { DEFAULT_PALETTE, getBookBySlug, slugSchema } from "./books";

describe("slugSchema (#5)", () => {
  it.each(["the-hobbit", "1984", "a", "fahrenheit-451", "a".repeat(100)])("accepts %s", (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });

  it.each([
    ["uppercase", "The-Hobbit"],
    ["dot segment", ".."],
    ["single dot", "."],
    ["dot inside", "the.hobbit"],
    ["percent-encoded", "the%20hobbit"],
    ["decoded space", "the hobbit"],
    ["slash", "the/hobbit"],
    ["leading -", "-the-hobbit"],
    ["trailing -", "the-hobbit-"],
    ["double --", "the--hobbit"],
    ["underscore", "the_hobbit"],
    ["empty string", ""],
    ["101 characters", "a".repeat(101)],
  ])("rejects %s (%s)", (_why, slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });
});

describe("DEFAULT_PALETTE (#19)", () => {
  it("has exactly primary, surface, text and highlight as #rrggbb", () => {
    expect(Object.keys(DEFAULT_PALETTE).sort()).toEqual(["highlight", "primary", "surface", "text"]);
    for (const value of Object.values(DEFAULT_PALETTE)) expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("passes the readability rule", () => {
    const p = DEFAULT_PALETTE;
    expect(contrastRatio(p.text, p.surface), "text on surface").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.highlight, p.surface), "highlight on surface").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.surface, p.primary), "surface on primary").toBeGreaterThanOrEqual(3);
    expect(isReadable(p)).toBe(true);
  });
});

describe("getBookBySlug when the database is unreachable (#6)", () => {
  beforeEach(() => {
    const down = new Error("Can't reach database server at `localhost:5432`");
    db.findUnique.mockReset().mockRejectedValue(down);
    db.findFirst.mockReset().mockRejectedValue(down);
  });

  it("rejects instead of resolving to null, so the route renders error.tsx and not the 404 page", async () => {
    await expect(getBookBySlug("the-hobbit")).rejects.toThrow(/reach database/);
  });
});
