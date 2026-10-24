// Spec: docs/specs/bookshop-display.md (criteria #2, #3, #11, #12)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ARTWORK_SIZE, ARTWORK_VERSION, ARTWORK_WIDTHS, HOTSPOTS } from "./hotspots";

const root = process.cwd();
const SOURCE_PNG = path.join(root, "docs", "bookstore display.png");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Criterion #11: the three served files and their exact pixel sizes.
const SERVED_SIZES = [
  { width: 1376, height: 768 },
  { width: 2064, height: 1152 },
  { width: 2752, height: 1536 },
] as const;

function pngSize(buf: Buffer): { width: number; height: number } {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG file");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

type WebpImage = { codec: "VP8L" | "VP8 "; width: number; height: number };

/** Walks the RIFF chunks and reads the first image bitstream header. VP8L = lossless, "VP8 " = lossy. */
function webpImage(buf: Buffer): WebpImage {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a WebP file");
  }
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const fourcc = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (fourcc === "VP8L") {
      if (buf[data] !== 0x2f) throw new Error("bad VP8L signature");
      const bits = buf.readUInt32LE(data + 1);
      return { codec: "VP8L", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (fourcc === "VP8 ") {
      return { codec: "VP8 ", width: buf.readUInt16LE(data + 6) & 0x3fff, height: buf.readUInt16LE(data + 8) & 0x3fff };
    }
    offset = data + size + (size & 1);
  }
  throw new Error("WebP file has no VP8L or VP8 image chunk");
}

const slotsOneToTwentyFive = Array.from({ length: 25 }, (_, i) => i + 1);

describe("HOTSPOTS map", () => {
  it("#2 has exactly 25 entries", () => {
    expect(HOTSPOTS).toHaveLength(25);
  });

  it("#2 uses each slot 1–25 exactly once", () => {
    const slots = HOTSPOTS.map((h) => h.slot).sort((a, b) => a - b);
    expect(slots).toEqual(slotsOneToTwentyFive);
  });

  it.each(HOTSPOTS.map((h) => [h.slot, h] as const))(
    "#2 slot %i stays within 0–100 on both axes",
    (_slot, h) => {
      const { top, left, width, height } = h.rect;
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(left + width).toBeLessThanOrEqual(100);
      expect(top + height).toBeLessThanOrEqual(100);
    },
  );

  it("#3 no two rectangles overlap", () => {
    const overlapping: string[] = [];
    for (let i = 0; i < HOTSPOTS.length; i++) {
      for (let j = i + 1; j < HOTSPOTS.length; j++) {
        const a = HOTSPOTS[i].rect;
        const b = HOTSPOTS[j].rect;
        const xOverlap = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
        const yOverlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
        if (xOverlap > 0 && yOverlap > 0) overlapping.push(`${HOTSPOTS[i].slot}↔${HOTSPOTS[j].slot}`);
      }
    }
    expect(overlapping).toEqual([]);
  });
});

describe("artwork assets", () => {
  const servedFile = (width: number) =>
    path.join(root, "public", "bookshop", `scene@${ARTWORK_VERSION}-${width}.webp`);

  it("#11 ARTWORK_WIDTHS lists the three served widths", () => {
    expect([...ARTWORK_WIDTHS]).toEqual(SERVED_SIZES.map((s) => s.width));
  });

  describe.each(SERVED_SIZES)("scene@{ARTWORK_VERSION}-$width.webp", ({ width, height }) => {
    it("#11 is committed under public/bookshop/", () => {
      expect(existsSync(servedFile(width)), servedFile(width)).toBe(true);
    });

    it("#11 is a lossless (VP8L) WebP", () => {
      expect(webpImage(readFileSync(servedFile(width))).codec).toBe("VP8L");
    });

    it(`#11 is exactly ${width}×${height}`, () => {
      const { width: w, height: h } = webpImage(readFileSync(servedFile(width)));
      expect({ width: w, height: h }).toEqual({ width, height });
    });
  });

  it("#12 ARTWORK_SIZE matches the master PNG's intrinsic dimensions (2752×1536)", () => {
    expect(ARTWORK_SIZE).toEqual(pngSize(readFileSync(SOURCE_PNG)));
  });
});
