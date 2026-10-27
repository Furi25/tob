// Hotspot types and helpers shared by every scene (docs/specs/multiple-bookshop-scenes.md).
// The data for each scene lives next to its artwork in ./scenes/.

/** An [x, y] point in percent of a hotspot's rectangle. */
export type Point = readonly [number, number];

export type Hotspot = {
  slot: number;
  /** Descriptive only; free text, not used by the app. */
  zone?: string;
  /** Percent of the artwork. */
  rect: { top: number; left: number; width: number; height: number };
  /** The book's silhouette: its outline in percent of `rect`. Drives the hit area, the edge and the focus ring. */
  shape: readonly Point[];
};

/** A polygon in pixels of some `PixelSpace`: origin top-left, x to the right, y down. */
export type PixelPolygon = readonly (readonly [x: number, y: number])[];

export type PixelSpace = { width: number; height: number };

/**
 * The master used to judge a pixel space's aspect ratio when none is given: the bookshop's, 2752×1536.
 * Scenes with a master of another ratio pass their own to `hotspotFromPixels`.
 */
const REFERENCE_MASTER: PixelSpace = { width: 2752, height: 1536 };

/** A `space` may differ from the master's aspect ratio by this much (stretched copies are accepted; crops are not). */
const MAX_RATIO_DRIFT = 0.01;

/** Rounding guard: a value that is a multiple of 0.1 up to float noise must not step a whole 0.1 outwards. */
const EPSILON = 1e-7;

const floorTenth = (v: number) => Math.floor(v * 10 + EPSILON) / 10;
const ceilTenth = (v: number) => Math.ceil(v * 10 - EPSILON) / 10;
const roundTenth = (v: number) => Math.round(v * 10) / 10;

/**
 * Derives a `Hotspot` from a polygon measured in pixels.
 *
 * - `rect` is the polygon's bounding box in percent of the artwork, rounded outwards to 0.1.
 * - `shape` is each vertex in percent of that `rect`, rounded to 0.1.
 * - Each coordinate is divided by `space`, not by the master, so a copy of the master needs no conversion.
 *
 * Throws (so a scene fails to load rather than rendering a wrong map) if the space's aspect ratio is more than 1%
 * off the master's, a point lies outside the space, there are fewer than 3 points, or the area is zero.
 */
export function hotspotFromPixels(
  slot: number,
  polygon: PixelPolygon,
  space: PixelSpace,
  zone?: string,
  master: PixelSpace = REFERENCE_MASTER,
): Hotspot {
  const what = `hotspot ${slot}`;
  if (!(space.width > 0) || !(space.height > 0)) throw new Error(`${what}: the pixel space must have a positive size`);
  const drift = space.width / space.height / (master.width / master.height) - 1;
  if (Math.abs(drift) > MAX_RATIO_DRIFT) {
    throw new Error(
      `${what}: the ${space.width}×${space.height} space is not a uniform copy of the ${master.width}×${master.height} master (aspect ratio off by ${(drift * 100).toFixed(2)}%)`,
    );
  }
  if (polygon.length < 3) throw new Error(`${what}: a polygon needs at least 3 points, got ${polygon.length}`);
  for (const [x, y] of polygon) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > space.width || y > space.height) {
      throw new Error(`${what}: point (${x}, ${y}) is outside the ${space.width}×${space.height} space`);
    }
  }

  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    twiceArea += x1 * y2 - x2 * y1;
  }
  if (Math.abs(twiceArea) < 1e-9) throw new Error(`${what}: the polygon has zero area`);

  const percent = polygon.map(([x, y]) => [(x / space.width) * 100, (y / space.height) * 100] as const);
  const xs = percent.map((p) => p[0]);
  const ys = percent.map((p) => p[1]);
  const left = floorTenth(Math.min(...xs));
  const top = floorTenth(Math.min(...ys));
  const right = ceilTenth(Math.max(...xs));
  const bottom = ceilTenth(Math.max(...ys));
  const width = roundTenth(right - left);
  const height = roundTenth(bottom - top);

  const inRect = (value: number) => Math.min(100, Math.max(0, roundTenth(value)));
  const shape = percent.map(([x, y]): Point => [inRect(((x - left) / width) * 100), inRect(((y - top) / height) * 100)]);

  return { slot, ...(zone === undefined ? {} : { zone }), rect: { top, left, width, height }, shape };
}

/** `x,y x,y ...`: the polygon's points, for an svg `points` attribute (viewBox 0 0 100 100). */
export const shapePoints = (shape: readonly Point[]): string => shape.map(([x, y]) => `${x},${y}`).join(" ");

/** The shape as a CSS `clip-path` polygon. */
export const shapeClipPath = (shape: readonly Point[]): string =>
  `polygon(${shape.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;
