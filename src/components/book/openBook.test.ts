// Spec: docs/specs/book-detail-open-book.md — Asset section, criteria #15, #16 (file half), #17
//
// Interface these tests rely on (the spec names OPEN_BOOK and its shape but not the file; the tester's
// choice is recorded here and should be added to the spec):
//   src/components/book/openBook.ts exports OPEN_BOOK = { basePath, widths, size: {width,height}, pages: {left,right} }
//   src/server/books.ts exports PARCHMENT
// Shipped files: public/book/open-book@v1-<width>.webp, true alpha, cropped to the book's outer edge.
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../../tests/support/contrast";
import * as books from "@/server/books";
import { OPEN_BOOK } from "./openBook";

const fileOf = (width: number) => path.resolve("public", `.${OPEN_BOOK.basePath}-${width}.webp`);
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

describe("OPEN_BOOK constants", () => {
  it("serves from /book/ with the shop's widths", () => {
    expect(OPEN_BOOK.basePath).toMatch(/^\/book\/open-book@v1$/);
    expect([...OPEN_BOOK.widths]).toEqual([1376, 2064, 2752]);
  });

  it("has a positive size", () => {
    expect(OPEN_BOOK.size.width).toBeGreaterThan(0);
    expect(OPEN_BOOK.size.height).toBeGreaterThan(0);
  });

  it.each(["left", "right"] as const)("keeps the %s page box inside 0–100%", (side) => {
    const { left, top, width, height } = OPEN_BOOK.pages[side];
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(left + width).toBeLessThanOrEqual(100);
    expect(top + height).toBeLessThanOrEqual(100);
  });

  it("puts the left page box before the right one, with a gap for the spine", () => {
    const { left, right } = OPEN_BOOK.pages;
    expect(left.left + left.width).toBeLessThan(right.left);
  });
});

describe("shipped book image files (#16, #17)", () => {
  it.each([1376, 2064, 2752])("%i px: exists, is WebP and has the ratio in OPEN_BOOK.size", async (width) => {
    const file = fileOf(width);
    expect(existsSync(file), `${file} must exist`).toBe(true);
    const meta = await sharp(file).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(width);
    const expected = OPEN_BOOK.size.width / OPEN_BOOK.size.height;
    expect((meta.width ?? 0) / (meta.height ?? 1)).toBeCloseTo(expected, 1);
  });

  it.each([1376, 2064, 2752])("%i px: has an alpha channel and fully transparent corners", async (width) => {
    const file = fileOf(width);
    expect(existsSync(file), `${file} must exist`).toBe(true);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    const { width: w, height: h } = info;
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
      expect(alphaAt(x, y), `alpha at (${x}, ${y})`).toBe(0);
    }
  });

  it("is cropped to the book: the middle of every edge row and column touches opaque pixels", async () => {
    const file = fileOf(OPEN_BOOK.widths[0]);
    expect(existsSync(file), `${file} must exist`).toBe(true);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    const rowOpaque = (y: number) => Array.from({ length: info.width }, (_, x) => alpha(x, y)).some((a) => a > 200);
    const colOpaque = (x: number) => Array.from({ length: info.height }, (_, y) => alpha(x, y)).some((a) => a > 200);
    expect(rowOpaque(0) || rowOpaque(1) || rowOpaque(2), "top edge").toBe(true);
    expect(rowOpaque(info.height - 1) || rowOpaque(info.height - 3), "bottom edge").toBe(true);
    expect(colOpaque(0) || colOpaque(2), "left edge").toBe(true);
    expect(colOpaque(info.width - 1) || colOpaque(info.width - 3), "right edge").toBe(true);
  });
});

describe("PARCHMENT matches the shipped asset (#15)", () => {
  it("is within 1.25:1 of the darkest 2% of paper pixels under the text boxes", async () => {
    const parchment = (books as Record<string, unknown>).PARCHMENT as string;
    expect(parchment, "PARCHMENT export from src/server/books.ts").toMatch(/^#[0-9a-fA-F]{6}$/);
    const file = fileOf(OPEN_BOOK.widths[0]);
    expect(existsSync(file), `${file} must exist`).toBe(true);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const lum: Array<[number, string]> = [];
    for (const side of ["left", "right"] as const) {
      const p = OPEN_BOOK.pages[side];
      const x0 = Math.floor((p.left / 100) * info.width);
      const x1 = Math.floor(((p.left + p.width) / 100) * info.width);
      const y0 = Math.floor((p.top / 100) * info.height);
      const y1 = Math.floor(((p.top + p.height) / 100) * info.height);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * info.width + x) * 4;
          if (data[i + 3] < 255) continue;
          const colour = hex(data[i], data[i + 1], data[i + 2]);
          lum.push([contrastRatio(colour, "#000000"), colour]);
        }
      }
    }
    expect(lum.length, "opaque paper pixels under the text boxes").toBeGreaterThan(1000);
    lum.sort((a, b) => a[0] - b[0]);
    const darkest = lum[Math.floor(lum.length * 0.02)][1];
    expect(contrastRatio(parchment, darkest)).toBeLessThanOrEqual(1.25);
  });
});
