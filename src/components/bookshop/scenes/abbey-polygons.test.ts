// The Abbey's books are traced polygons, not boxes. Spec: docs/specs/abbey-polygon-outlines.md (AP #n below).
// Red tests (AP #1, #7) fail until abbey.ts holds real polygons. The rest guard what must survive the change:
// slot identity and the rect/shape derivation (AP #2, #3). Overlap, self-crossing and minimum-size checks for every
// scene already live in scenes.test.ts (multi-scene criteria 3-5, 21), so they are not repeated here.
// AP #8 (calibration) and AP #11 (the editor) are manual checks by the tester.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pointInPolygon } from "../../../../tests/e2e/support/geometry";
import { ABBEY_BOXES, ABBEY_MASTER_SIZE, ABBEY_SLOT_COUNT } from "../../../../tests/support/abbey-boxes";
import { polygonArea, selfCrossings, toArtworkPx, type Pt } from "../../../../tests/support/polygons";
import { getScene } from "./index";

const abbey = getScene("abbey");
const hotspots = abbey?.hotspots ?? [];
const { width: W, height: H } = ABBEY_MASTER_SIZE;

describe("AP #1 the Abbey's data holds polygons, not boxes", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "components", "bookshop", "scenes", "abbey.ts"), "utf8");

  it("no longer defines the BOXES array or wraps boxes into 4-point polygons", () => {
    expect(source).not.toMatch(/\bBOXES\b/);
  });

  it("defines a POLYGONS array", () => {
    expect(source).toMatch(/\bPOLYGONS\b/);
  });

  it("has 29 hotspots, each with at least 3 points, a non-zero area and no self-crossing", () => {
    expect(hotspots).toHaveLength(ABBEY_SLOT_COUNT);
    for (const h of hotspots) {
      expect(h.shape.length, `slot ${h.slot} points`).toBeGreaterThanOrEqual(3);
      expect(polygonArea(h.shape), `slot ${h.slot} area`).toBeGreaterThan(0);
      expect(selfCrossings(h.shape), `slot ${h.slot} self-crossings`).toEqual([]);
    }
  });

  it("has every polygon vertex inside the 2752×1536 master", () => {
    for (const h of hotspots) {
      for (const [x, y] of toArtworkPx(h, ABBEY_MASTER_SIZE)) {
        expect(x, `slot ${h.slot} x`).toBeGreaterThanOrEqual(0);
        expect(x, `slot ${h.slot} x`).toBeLessThanOrEqual(W);
        expect(y, `slot ${h.slot} y`).toBeGreaterThanOrEqual(0);
        expect(y, `slot ${h.slot} y`).toBeLessThanOrEqual(H);
      }
    }
  });
});

describe("AP #2 slot numbers and order do not change", () => {
  it("keeps slots 1..29 in order", () => {
    expect(hotspots.map((h) => h.slot)).toEqual(Array.from({ length: ABBEY_SLOT_COUNT }, (_, i) => i + 1));
  });

  it("keeps every book where it was: the polygon's centre lies within its old box, give or take the ±4 px tolerance", () => {
    for (const h of hotspots) {
      const [x1, y1, x2, y2] = ABBEY_BOXES[h.slot];
      const px = toArtworkPx(h, ABBEY_MASTER_SIZE);
      const cx = px.reduce((s, p) => s + p[0], 0) / px.length;
      const cy = px.reduce((s, p) => s + p[1], 0) / px.length;
      expect(cx, `slot ${h.slot} centre x`).toBeGreaterThanOrEqual(x1 - 4);
      expect(cx, `slot ${h.slot} centre x`).toBeLessThanOrEqual(x2 + 4);
      expect(cy, `slot ${h.slot} centre y`).toBeGreaterThanOrEqual(y1 - 4);
      expect(cy, `slot ${h.slot} centre y`).toBeLessThanOrEqual(y2 + 4);
    }
  });
});

describe("AP #2, #3 rect and shape are derived from the polygon", () => {
  it("has a rect that is the polygon's bounding box rounded outwards to 0.1%: the shape touches all four sides, within one step", () => {
    for (const h of hotspots) {
      const xs = h.shape.map((p) => p[0]);
      const ys = h.shape.map((p) => p[1]);
      // One 0.1% step of the artwork, as a percentage of this rect.
      const stepX = 0.1 / h.rect.width * 100;
      const stepY = 0.1 / h.rect.height * 100;
      expect(Math.min(...xs), `slot ${h.slot} left`).toBeLessThanOrEqual(stepX + 0.1);
      expect(100 - Math.max(...xs), `slot ${h.slot} right`).toBeLessThanOrEqual(stepX + 0.1);
      expect(Math.min(...ys), `slot ${h.slot} top`).toBeLessThanOrEqual(stepY + 0.1);
      expect(100 - Math.max(...ys), `slot ${h.slot} bottom`).toBeLessThanOrEqual(stepY + 0.1);
    }
  });

  it("stores every shape value inside 0..100, rounded to 0.1", () => {
    for (const h of hotspots) {
      for (const [x, y] of h.shape) {
        for (const v of [x, y]) {
          expect(v, `slot ${h.slot}`).toBeGreaterThanOrEqual(0);
          expect(v, `slot ${h.slot}`).toBeLessThanOrEqual(100);
          expect(Math.abs(v * 10 - Math.round(v * 10)), `slot ${h.slot} value ${v}`).toBeLessThan(1e-6);
        }
      }
    }
  });
});

describe("AP #7 the silhouettes are book-shaped, not rectangles", () => {
  // An axis-aligned box has 4 vertices and only two distinct x and two distinct y values.
  const isAxisAlignedBox = (shape: readonly Pt[]) =>
    shape.length === 4 && new Set(shape.map((p) => p[0])).size <= 2 && new Set(shape.map((p) => p[1])).size <= 2;
  const bookShaped = hotspots.filter((h) => !isAxisAlignedBox(h.shape));

  it("has at least one book whose silhouette is not an axis-aligned box", () => {
    expect(bookShaped.length).toBeGreaterThanOrEqual(1);
  });

  it("has, for those books, a point inside the rectangle but outside the silhouette, so a click there misses", () => {
    expect(bookShaped.length).toBeGreaterThanOrEqual(1);
    for (const h of bookShaped) {
      const misses = [[1, 1], [99, 1], [99, 99], [1, 99], [50, 1], [50, 99], [1, 50], [99, 50]] as const;
      expect(
        misses.some((p) => !pointInPolygon(p, h.shape)),
        `slot ${h.slot} fills its whole rectangle`,
      ).toBe(true);
    }
  });
});
