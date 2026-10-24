// Hotspot rectangles for the bookshop artwork (docs/specs/bookshop-display.md).
// Coordinates are percentages of the artwork, traced from docs/bookstore display.png in
// mockups/bookstore-display/app.js and trimmed so neighbouring rectangles never overlap.
// They belong to ARTWORK_VERSION: any change to the image means recalibrating with /?hotspots=1.
// Each `shape` is the book's silhouette, in percent of its rectangle. It comes from the polygons in
// mockups/bookstore-display/app.js, clipped to the (slightly trimmed) rectangle.

export type Zone = "front-shelf" | "low-table" | "display-stand" | "counter" | "back-wall";

/** An [x, y] point in percent of a hotspot's rectangle. */
export type Point = readonly [number, number];

export type Hotspot = {
  slot: number;
  zone: Zone;
  rect: { top: number; left: number; width: number; height: number };
  shape: readonly Point[];
};

export const ARTWORK_VERSION = "v1";

/** Intrinsic size of the master, docs/bookstore display.png. Sets the scene's aspect ratio. */
export const ARTWORK_SIZE = { width: 2752, height: 1536 } as const;

/** Widths of the served files, public/bookshop/scene@{ARTWORK_VERSION}-{width}.webp. */
export const ARTWORK_WIDTHS = [1376, 2064, 2752] as const;

const spot = (
  slot: number,
  zone: Zone,
  left: number,
  top: number,
  width: number,
  height: number,
  shape: readonly Point[],
): Hotspot => ({
  slot,
  zone,
  rect: { top, left, width, height },
  shape,
});

export const HOTSPOTS: readonly Hotspot[] = [
  spot(1, "front-shelf", 2.8, 79.2, 5.6, 9.4, [[0, 0], [62, 5], [100, 96], [12, 100]]),
  spot(2, "front-shelf", 8.7, 79.1, 6.0, 10.8, [[0, 0], [73.2, 5], [100, 88.8], [100, 94.1], [24.4, 100]]),
  spot(3, "front-shelf", 14.8, 79.4, 4.8, 11.2, [[0, 8.9], [0, 0.1], [76.5, 5], [100, 80.6], [100, 94.3], [21.3, 100]]),
  spot(4, "front-shelf", 19.7, 80.6, 6.0, 11.1, [[0, 7.5], [0, 0.1], [73.6, 3], [100, 94], [20.7, 100]]),
  spot(5, "front-shelf", 26.0, 81.0, 6.4, 11.6, [[0, 0], [75, 5], [100, 94], [22, 100]]),
  spot(6, "back-wall", 26.5, 33.9, 3.3, 7.0, [[6, 0], [100, 0], [94, 100], [0, 100]]),
  spot(7, "back-wall", 27.7, 43.9, 2.2, 5.9, [[8, 0], [100, 0], [94, 100], [0, 100]]),
  spot(8, "back-wall", 17.3, 49.8, 3.1, 5.7, [[0, 14], [80, 0], [100, 85], [20, 100]]),
  spot(9, "low-table", 35.1, 80.9, 8.7, 6.4, [[0, 64], [31, 0], [58, 10], [78, 3], [100, 49], [91, 91], [51, 100]]),
  spot(10, "low-table", 39.1, 65.9, 5.6, 4.8, [[0, 51], [40, 0], [69, 5], [100, 51], [57, 100], [18, 84]]),
  spot(11, "back-wall", 41.8, 42.6, 3.3, 7.1, [[0, 8], [82, 0], [100, 94], [12, 100]]),
  spot(12, "display-stand", 70.9, 63.0, 5.8, 11.5, [[21, 0], [100, 13], [74, 100], [0, 87]]),
  spot(13, "display-stand", 78.5, 59.7, 4.6, 11.2, [[0, 10], [81.4, 0], [100, 51.1], [100, 88.9], [26, 100]]),
  spot(14, "display-stand", 83.2, 57.1, 5.0, 10.3, [[0, 48.6], [0, 8.5], [66.4, 0], [100, 84], [16, 100]]),
  spot(15, "display-stand", 68.9, 75.6, 4.9, 10.6, [[22, 0], [100, 13], [78, 100], [0, 85]]),
  spot(16, "display-stand", 80.6, 71.8, 4.1, 7.6, [[0, 11], [68, 0], [100, 66.6], [100, 88.6], [28.5, 100]]),
  spot(17, "display-stand", 84.8, 70.8, 4.0, 10.4, [[0, 39.2], [0, 10.4], [66.8, 0], [100, 64.6], [100, 85.8], [22.4, 100]]),
  spot(18, "display-stand", 88.9, 66.5, 3.8, 10.5, [[0, 34.2], [0, 10.6], [62.2, 0], [100, 85], [23.4, 100]]),
  spot(19, "display-stand", 68.0, 87.4, 5.1, 10.1, [[21, 0], [100, 11], [80, 100], [0, 85]]),
  spot(20, "display-stand", 73.5, 91.1, 4.6, 8.8, [[17, 0], [100, 11.1], [85.2, 100], [75.4, 100], [0, 91]]),
  spot(21, "counter", 56.4, 46.1, 3.1, 6.8, [[23.4, 0], [100, 12], [100, 38.1], [84.1, 100], [0, 88]]),
  spot(22, "counter", 59.6, 46.8, 3.0, 7.2, [[0, 75.5], [22, 0], [100, 12], [100, 35.9], [81.4, 100], [0, 87.5]]),
  spot(23, "counter", 62.7, 47.7, 3.0, 7.3, [[0, 65.9], [20.8, 0], [100, 12.5], [100, 24.5], [78, 100], [0, 88]]),
  spot(24, "counter", 65.8, 49.5, 3.0, 7.3, [[0, 55.4], [17.5, 0], [100, 13], [74.7, 100], [0, 88.5]]),
  spot(25, "back-wall", 52.1, 24.1, 3.5, 6.7, [[16, 0], [100, 5], [85, 100], [0, 97]]),
];

/** `x,y x,y ...`: the polygon's points, for an svg `points` attribute (viewBox 0 0 100 100). */
export const shapePoints = (shape: readonly Point[]): string => shape.map(([x, y]) => `${x},${y}`).join(" ");

/** The shape as a CSS `clip-path` polygon. */
export const shapeClipPath = (shape: readonly Point[]): string =>
  `polygon(${shape.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;
