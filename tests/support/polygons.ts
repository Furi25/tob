// Test-only polygon geometry for the scene registry tests (docs/specs/multiple-bookshop-scenes.md, criteria 3, 4, 5).
// Written independently of the app: it reads hotspot data and checks it, and never reuses app helpers.
import { pointInPolygon } from "../e2e/support/geometry";

export type Pt = readonly [number, number];
export type RectPct = { top: number; left: number; width: number; height: number };
export type ShapedHotspot = { rect: RectPct; shape: readonly Pt[] };

/** Absolute polygon area (shoelace). */
export function polygonArea(p: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const EPS = 1e-9;

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return (
    Math.abs(cross(a, b, p)) <= EPS &&
    p[0] >= Math.min(a[0], b[0]) - EPS &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

/** True when the closed segments share at least one point. */
function segmentsTouch(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** Pairs of edges (as "i×j") that cross or touch although they are not neighbours. Empty for a simple polygon. */
export function selfCrossings(p: readonly Pt[]): string[] {
  const n = p.length;
  const found: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const neighbours = j === i + 1 || (i === 0 && j === n - 1);
      if (neighbours) continue;
      if (segmentsTouch(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) found.push(`${i}×${j}`);
    }
  }
  return found;
}

/** A hotspot's shape in artwork pixels. `shape` is in percent of `rect`, `rect` in percent of the artwork. */
export function toArtworkPx(h: ShapedHotspot, size: { width: number; height: number }): Pt[] {
  return h.shape.map(([sx, sy]): Pt => [
    ((h.rect.left + (sx / 100) * h.rect.width) / 100) * size.width,
    ((h.rect.top + (sy / 100) * h.rect.height) / 100) * size.height,
  ]);
}

const bounds = (p: readonly Pt[]) => ({
  x1: Math.min(...p.map((q) => q[0])),
  y1: Math.min(...p.map((q) => q[1])),
  x2: Math.max(...p.map((q) => q[0])),
  y2: Math.max(...p.map((q) => q[1])),
});

/** Area shared by two polygons, by sampling cell centres of the bounding-box overlap. Units follow the input. */
export function overlapArea(a: readonly Pt[], b: readonly Pt[], step = 0.5): number {
  const ba = bounds(a);
  const bb = bounds(b);
  const x1 = Math.max(ba.x1, bb.x1);
  const y1 = Math.max(ba.y1, bb.y1);
  const x2 = Math.min(ba.x2, bb.x2);
  const y2 = Math.min(ba.y2, bb.y2);
  if (x1 >= x2 || y1 >= y2) return 0;
  let cells = 0;
  for (let x = x1 + step / 2; x < x2; x += step) {
    for (let y = y1 + step / 2; y < y2; y += step) {
      if (pointInPolygon([x, y], a) && pointInPolygon([x, y], b)) cells++;
    }
  }
  return cells * step * step;
}
