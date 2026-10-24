// Spec: docs/specs/bookshop-display.md (criterion #28)
// Hotspot shapes: the book silhouette that drives the hover/click area, the glowing edge and the focus ring.
import { describe, expect, it } from "vitest";
import { HOTSPOTS, type Hotspot } from "./hotspots";

type Point = readonly [number, number];
// The field is read through an optional view so this file type-checks before and after `shape` exists.
type WithShape = { shape?: readonly Point[] };
const shapeOf = (h: Hotspot) => (h as Hotspot & WithShape).shape;

/** Shoelace formula. Units are percent² of the hotspot's rectangle. */
function area(shape: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < shape.length; i++) {
    const [x1, y1] = shape[i];
    const [x2, y2] = shape[(i + 1) % shape.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

describe("HOTSPOTS shapes", () => {
  it.each(HOTSPOTS.map((h) => [h.slot, h] as const))("#28 slot %i has a shape of 3 or more points", (_slot, h) => {
    const shape = shapeOf(h);
    expect(shape, `slot ${h.slot} has no shape`).toBeDefined();
    expect(Array.isArray(shape), "shape is an array of points").toBe(true);
    expect(shape?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it.each(HOTSPOTS.map((h) => [h.slot, h] as const))("#28 slot %i has every coordinate within 0–100", (_slot, h) => {
    const shape = shapeOf(h);
    expect(shape, `slot ${h.slot} has no shape`).toBeDefined();
    for (const point of shape ?? []) {
      expect(point, "a point is an [x, y] pair").toHaveLength(2);
      for (const value of point) {
        expect(Number.isFinite(value), `${JSON.stringify(point)} is finite`).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it.each(HOTSPOTS.map((h) => [h.slot, h] as const))("#28 slot %i has a polygon with non-zero area", (_slot, h) => {
    const shape = shapeOf(h);
    expect(shape, `slot ${h.slot} has no shape`).toBeDefined();
    expect(area(shape ?? [])).toBeGreaterThan(0);
  });
});
