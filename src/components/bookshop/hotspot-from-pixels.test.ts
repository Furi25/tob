// Spec: docs/specs/multiple-bookshop-scenes.md — criterion #5, hotspotFromPixels (Hotspot Coordinates).
//
// ASSUMED SIGNATURE, from the spec: hotspotFromPixels(slot, polygon, space, zone?) exported from
// src/components/bookshop/hotspots.ts, where `polygon` is an array of [x, y] pixel pairs and `space` is { width, height }.
// The spec calls the signature illustrative; adjust the calls here if the implementer's differs.
// Red until the function exists.
import { beforeAll, describe, expect, it } from "vitest";
import { hotspotFromPixels } from "./hotspots";

type Result = ReturnType<typeof hotspotFromPixels>;

const MASTER = { width: 2752, height: 1536 };
const SMALLER = { width: 1920, height: 1080 }; // 0.8% off the master's aspect ratio: allowed

type Pair = [number, number];

/** A polygon given in percent of the artwork, expressed in the pixels of `space`. */
const inSpace = (percent: Pair[], space: { width: number; height: number }): Pair[] =>
  percent.map(([x, y]) => [(x / 100) * space.width, (y / 100) * space.height]);

// Edges sit mid-way between 0.1% steps, so rounding outwards is unambiguous in every space.
const PENTAGON_PERCENT: Pair[] = [[10.05, 12.35], [13.55, 11.25], [13.05, 15.55], [11.25, 15.45], [10.35, 14.05]];
const RECTANGLE_PERCENT: Pair[] = [[10.05, 12.35], [13.55, 12.35], [13.55, 15.55], [10.05, 15.55]];

const onTenthStep = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;

/** Maps a shape vertex (percent of the rectangle) back to px of `space`. */
function backToPx(
  h: { rect: { top: number; left: number; width: number; height: number }; shape: readonly (readonly [number, number])[] },
  space: { width: number; height: number },
): Pair[] {
  return h.shape.map(([sx, sy]): Pair => [
    ((h.rect.left + (sx / 100) * h.rect.width) / 100) * space.width,
    ((h.rect.top + (sy / 100) * h.rect.height) / 100) * space.height,
  ]);
}

describe("#5 hotspotFromPixels: result", () => {
  const polygon = inSpace(PENTAGON_PERCENT, MASTER);
  let h: Result;
  beforeAll(() => {
    h = hotspotFromPixels(7, polygon, MASTER);
  });

  it("keeps the slot and passes a given zone through", () => {
    expect(h.slot).toBe(7);
    expect(hotspotFromPixels(3, polygon, MASTER, "counter").zone).toBe("counter");
  });

  it("returns a rectangle that contains the whole polygon, rounded outwards to 0.1", () => {
    const { top, left, width, height } = h.rect;
    for (const v of [top, left, width, height]) expect(onTenthStep(v), `${v} is a multiple of 0.1`).toBe(true);
    const minX = Math.min(...PENTAGON_PERCENT.map((p) => p[0]));
    const maxX = Math.max(...PENTAGON_PERCENT.map((p) => p[0]));
    const minY = Math.min(...PENTAGON_PERCENT.map((p) => p[1]));
    const maxY = Math.max(...PENTAGON_PERCENT.map((p) => p[1]));
    expect(left).toBeCloseTo(Math.floor(minX * 10) / 10, 6);
    expect(left + width).toBeCloseTo(Math.ceil(maxX * 10) / 10, 6);
    expect(top).toBeCloseTo(Math.floor(minY * 10) / 10, 6);
    expect(top + height).toBeCloseTo(Math.ceil(maxY * 10) / 10, 6);
  });

  it("returns a shape that maps back to the input within 0.5 master px", () => {
    expect(h.shape).toHaveLength(polygon.length);
    const back = backToPx(h, MASTER);
    back.forEach(([x, y], i) => {
      expect(Math.hypot(x - polygon[i][0], y - polygon[i][1]), `vertex ${i}`).toBeLessThanOrEqual(0.5);
    });
  });

  it("returns shape coordinates inside 0–100", () => {
    for (const [x, y] of h.shape) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });
});

describe("#5 hotspotFromPixels: a rectangle", () => {
  const polygon = inSpace(RECTANGLE_PERCENT, MASTER);
  let h: Result;
  beforeAll(() => {
    h = hotspotFromPixels(1, polygon, MASTER);
  });

  it("gives a 4-point shape", () => {
    expect(h.shape).toHaveLength(4);
  });

  it("maps its four corners back within 0.5 master px", () => {
    const back = backToPx(h, MASTER);
    back.forEach(([x, y], i) => {
      expect(Math.hypot(x - polygon[i][0], y - polygon[i][1]), `corner ${i}`).toBeLessThanOrEqual(0.5);
    });
  });
});

describe("#5 hotspotFromPixels: the same polygon in another pixel space", () => {
  it("gives the same hotspot within 0.1 in 1920×1080 and in 2752×1536 space", () => {
    const a = hotspotFromPixels(4, inSpace(PENTAGON_PERCENT, MASTER), MASTER);
    const b = hotspotFromPixels(4, inSpace(PENTAGON_PERCENT, SMALLER), SMALLER);

    for (const key of ["top", "left", "width", "height"] as const) {
      expect(Math.abs(a.rect[key] - b.rect[key]), `rect.${key}`).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    expect(b.shape).toHaveLength(a.shape.length);
    a.shape.forEach(([x, y], i) => {
      expect(Math.abs(x - b.shape[i][0]), `shape[${i}].x`).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(Math.abs(y - b.shape[i][1]), `shape[${i}].y`).toBeLessThanOrEqual(0.1 + 1e-9);
    });
  });
});

describe("#5 hotspotFromPixels: rejects bad input", () => {
  const ok = inSpace(RECTANGLE_PERCENT, MASTER);
  // Without this guard a missing export would make every `toThrow()` below pass (calling undefined throws).
  const expectRejected = (call: () => unknown) => {
    expect(typeof hotspotFromPixels, "hotspotFromPixels is exported as a function").toBe("function");
    expect(call).toThrow();
  };

  it("accepts the good input these cases are built from", () => {
    expect(() => hotspotFromPixels(1, ok, MASTER)).not.toThrow();
  });

  it.each([
    ["x beyond the right edge", [[100, 100], [2753, 100], [2753, 200], [100, 200]]],
    ["y beyond the bottom edge", [[100, 100], [300, 100], [300, 1537], [100, 1537]]],
    ["a negative x", [[-1, 100], [300, 100], [300, 200], [-1, 200]]],
    ["a negative y", [[100, -1], [300, -1], [300, 200], [100, 200]]],
  ] as [string, Pair[]][])("a point outside the space: %s", (_name, polygon) => {
    expectRejected(() => hotspotFromPixels(1, polygon, MASTER));
  });

  it("fewer than 3 points", () => {
    expectRejected(() => hotspotFromPixels(1, [[100, 100], [300, 200]], MASTER));
    expectRejected(() => hotspotFromPixels(1, [[100, 100]], MASTER));
    expectRejected(() => hotspotFromPixels(1, [], MASTER));
  });

  it("zero area: three collinear points", () => {
    expectRejected(() => hotspotFromPixels(1, [[100, 100], [200, 200], [300, 300]], MASTER));
  });

  it("zero area: all points the same", () => {
    expectRejected(() => hotspotFromPixels(1, [[100, 100], [100, 100], [100, 100]], MASTER));
  });

  it.each([
    ["wider than the master", { width: 2752, height: 1200 }],
    ["taller than the master", { width: 2752, height: 1800 }],
    ["a 4:3 space", { width: 1600, height: 1200 }],
    ["a square space", { width: 1000, height: 1000 }],
  ])("a space whose aspect ratio differs from the master's by more than 1%: %s", (_name, space) => {
    const polygon: Pair[] = [[100, 100], [300, 100], [300, 200], [100, 200]];
    expectRejected(() => hotspotFromPixels(1, polygon, space));
  });
});
