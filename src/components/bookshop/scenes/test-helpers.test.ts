// Self-checks for the test helpers in tests/support (polygons, image headers) and the frozen fixtures.
// These run against today's repo and are green on purpose: a validator that was never shown to accept good data and
// reject bad data would let the real scene tests pass or fail for the wrong reason.
// Spec: docs/specs/multiple-bookshop-scenes.md (supports criteria 3, 4, 6).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ABBEY_BOXES, ABBEY_MASTER_SIZE, ABBEY_SLOT_COUNT } from "../../../../tests/support/abbey-boxes";
import { BOOKSHOP_V1_ARTWORK, BOOKSHOP_V1_HOTSPOTS } from "../../../../tests/support/bookshop-v1";
import { masterSize, webpImage } from "../../../../tests/support/image-headers";
import { overlapArea, polygonArea, selfCrossings, toArtworkPx, type Pt } from "../../../../tests/support/polygons";

const root = process.cwd();
const square = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

describe("polygon helpers", () => {
  it("polygonArea measures a 10×10 square as 100, whichever way it winds", () => {
    expect(polygonArea(square(0, 0, 10))).toBe(100);
    expect(polygonArea([...square(0, 0, 10)].reverse())).toBe(100);
  });

  it("polygonArea is 0 for three collinear points", () => {
    expect(polygonArea([[0, 0], [5, 5], [10, 10]])).toBe(0);
  });

  it("selfCrossings finds the crossing edges of a bow-tie and nothing in a square", () => {
    expect(selfCrossings([[0, 0], [10, 10], [10, 0], [0, 10]]).length).toBeGreaterThan(0);
    expect(selfCrossings(square(0, 0, 10))).toEqual([]);
  });

  it("selfCrossings finds a vertex that touches a non-neighbouring edge", () => {
    expect(selfCrossings([[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]]).length).toBeGreaterThan(0);
  });

  it("overlapArea sees a 5×5 overlap, and sees none for squares that only share an edge", () => {
    expect(overlapArea(square(0, 0, 10), square(5, 5, 10))).toBeCloseTo(25, 0);
    expect(overlapArea(square(0, 0, 10), square(10, 0, 10))).toBe(0);
    expect(overlapArea(square(0, 0, 10), square(20, 20, 10))).toBe(0);
  });

  it("toArtworkPx maps a shape in percent of its rectangle back to artwork pixels", () => {
    const px = toArtworkPx(
      { rect: { left: 10, top: 20, width: 10, height: 10 }, shape: [[0, 0], [100, 100]] },
      { width: 1000, height: 500 },
    );
    expect(px).toEqual([[100, 100], [200, 150]]);
  });
});

describe("frozen bookshop v1 fixture passes the same validators the scene tests use", () => {
  const size = BOOKSHOP_V1_ARTWORK.size;

  it("has 25 hotspots, each with a simple, non-degenerate shape", () => {
    expect(BOOKSHOP_V1_HOTSPOTS).toHaveLength(25);
    for (const h of BOOKSHOP_V1_HOTSPOTS) {
      expect(h.shape.length, `slot ${h.slot}`).toBeGreaterThanOrEqual(3);
      expect(polygonArea(h.shape), `slot ${h.slot} area`).toBeGreaterThan(0);
      expect(selfCrossings(h.shape), `slot ${h.slot} self-crossings`).toEqual([]);
    }
  });

  it("has no two silhouettes that overlap by more than 4 master px²", () => {
    const polygons = BOOKSHOP_V1_HOTSPOTS.map((h) => ({ slot: h.slot, px: toArtworkPx(h, size) }));
    const overlapping: string[] = [];
    for (let i = 0; i < polygons.length; i++) {
      for (let j = i + 1; j < polygons.length; j++) {
        if (overlapArea(polygons[i].px, polygons[j].px) > 4) overlapping.push(`${polygons[i].slot}↔${polygons[j].slot}`);
      }
    }
    expect(overlapping).toEqual([]);
  });
});

describe("Abbey appendix fixture", () => {
  it("has 29 boxes, numbered 1–29, inside the 2752×1536 master", () => {
    expect(ABBEY_SLOT_COUNT).toBe(29);
    expect(Object.keys(ABBEY_BOXES).map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
    for (const [slot, [x1, y1, x2, y2]] of Object.entries(ABBEY_BOXES)) {
      expect(x1, `slot ${slot}`).toBeGreaterThanOrEqual(0);
      expect(y1, `slot ${slot}`).toBeGreaterThanOrEqual(0);
      expect(x2, `slot ${slot}`).toBeGreaterThan(x1);
      expect(y2, `slot ${slot}`).toBeGreaterThan(y1);
      expect(x2, `slot ${slot}`).toBeLessThanOrEqual(ABBEY_MASTER_SIZE.width);
      expect(y2, `slot ${slot}`).toBeLessThanOrEqual(ABBEY_MASTER_SIZE.height);
    }
  });

  it("has no two boxes that overlap", () => {
    const boxes = Object.entries(ABBEY_BOXES).map(([slot, b]) => ({ slot, b }));
    const overlapping: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b;
        const c = boxes[j].b;
        if (Math.min(a[2], c[2]) > Math.max(a[0], c[0]) && Math.min(a[3], c[3]) > Math.max(a[1], c[1])) {
          overlapping.push(`${boxes[i].slot}↔${boxes[j].slot}`);
        }
      }
    }
    expect(overlapping).toEqual([]);
  });
});

describe("image header readers", () => {
  it("read the Abbey master as a 2752×1536 PNG", () => {
    expect(masterSize(path.join(root, "docs", "scenes", "gothic.png"))).toEqual(ABBEY_MASTER_SIZE);
  });

  it("read today's 1376-wide bookshop file as lossless 1376×768", () => {
    const buf = readFileSync(path.join(root, "public", "bookshop", "scene@v1-1376.webp"));
    expect(webpImage(buf)).toEqual({ codec: "VP8L", width: 1376, height: 768 });
  });
});
