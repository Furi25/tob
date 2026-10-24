// Test-only helpers for the bookshop silhouette tests (docs/specs/bookshop-display.md, criteria 29-34).
// Written independently of the app: they read computed styles and DOM attributes back and compare
// them with the shape data, instead of reusing whatever the implementation generates.

export type Point = readonly [number, number];
export type Size = { width: number; height: number };

/** Even-odd ray casting. Boundary points count as either side; callers keep a margin. */
export function pointInPolygon([px, py]: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distanceToBoundary(point: Point, polygon: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    best = Math.min(best, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return best;
}

export type Picked = { point: Point; margin: number };

/**
 * Scans the rectangle on a percentage grid and returns, in the box's own pixel space:
 * - `inside`: the point inside the polygon furthest from its boundary
 * - `outside`: the point in the box but outside the polygon furthest from the boundary
 * `margin` is the distance to the polygon boundary in CSS px, so callers can ignore near-misses.
 */
export function pickPoints(shape: readonly Point[], size: Size): { inside: Picked | null; outside: Picked | null } {
  const polygon = shape.map(([x, y]): Point => [(x * size.width) / 100, (y * size.height) / 100]);
  let inside: Picked | null = null;
  let outside: Picked | null = null;
  for (let gx = 0.5; gx < 100; gx += 1) {
    for (let gy = 0.5; gy < 100; gy += 1) {
      const point: Point = [(gx * size.width) / 100, (gy * size.height) / 100];
      const margin = distanceToBoundary(point, polygon);
      if (pointInPolygon(point, polygon)) {
        if (!inside || margin > inside.margin) inside = { point, margin };
      } else if (!outside || margin > outside.margin) {
        outside = { point, margin };
      }
    }
  }
  return { inside, outside };
}

/** Reads an SVG `points` attribute ("x,y x,y ..." or "x y x y ...") into pairs. */
export function parsePoints(attribute: string | null): Point[] {
  if (attribute === null) throw new Error("polygon has no points attribute");
  const numbers = attribute.trim().split(/[\s,]+/).map(Number);
  if (numbers.length % 2 !== 0 || numbers.some((n) => !Number.isFinite(n))) {
    throw new Error(`cannot read points="${attribute}"`);
  }
  const pairs: Point[] = [];
  for (let i = 0; i < numbers.length; i += 2) pairs.push([numbers[i], numbers[i + 1]]);
  return pairs;
}

/**
 * Reads a computed `clip-path: polygon(...)` into percentages of the box. Chromium may serialise
 * coordinates as percentages or as px, so px values are converted with the box size. Null when the
 * value is not a polygon (for example "none").
 */
export function parseClipPath(value: string, size: Size): Point[] | null {
  const match = /^polygon\((.*)\)$/s.exec(value.trim());
  if (!match) return null;
  const parts = match[1].split(",").map((s) => s.trim());
  if (/^(nonzero|evenodd)$/.test(parts[0])) parts.shift();
  const toPercent = (token: string, axis: number): number => {
    const m = /^(-?\d*\.?\d+)(%|px)?$/.exec(token);
    if (!m) return NaN;
    const n = Number(m[1]);
    return m[2] === "%" ? n : (n / axis) * 100;
  };
  return parts.map((pair): Point => {
    const [x, y] = pair.split(/\s+/);
    return [toPercent(x ?? "", size.width), toPercent(y ?? "", size.height)];
  });
}

export function pointsMatch(actual: readonly Point[], expected: readonly Point[], tolerance: number): boolean {
  return (
    actual.length === expected.length &&
    actual.every(([x, y], i) => Math.abs(x - expected[i][0]) <= tolerance && Math.abs(y - expected[i][1]) <= tolerance)
  );
}

export type Rgba = { r: number; g: number; b: number; a: number };

/** Reads the colour strings Chromium's getComputedStyle returns: rgb(), rgba() or "transparent". */
export function parseCssColor(value: string): Rgba {
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (!m) throw new Error(`cannot read colour "${value}"`);
  const [r, g, b, a] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a: a ?? 1 };
}

/** True when every duration in a CSS time list ("0s", "0s, 0s") is zero. */
export const allZero = (cssTimeList: string): boolean => cssTimeList.split(",").every((v) => parseFloat(v) === 0);
