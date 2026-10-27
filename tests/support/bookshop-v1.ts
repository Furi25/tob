// Frozen copy of the bookshop scene as it was before docs/specs/multiple-bookshop-scenes.md.
// Criterion 1 (hotspots unchanged) and criterion 12 (same 25 books in the same slots) compare the new code
// against this file, so it must never be regenerated from the new code. Copied from the pre-change
// src/components/bookshop/hotspots.ts and from the slots the pre-change seed produced (SHUFFLE_SEED 0x7b0c5).

export type FrozenPoint = readonly [number, number];
export type FrozenHotspot = {
  slot: number;
  rect: { top: number; left: number; width: number; height: number };
  shape: readonly FrozenPoint[];
};

const h = (
  slot: number,
  left: number,
  top: number,
  width: number,
  height: number,
  shape: readonly FrozenPoint[],
): FrozenHotspot => ({ slot, rect: { top, left, width, height }, shape });

export const BOOKSHOP_V1_ARTWORK = {
  version: "v1",
  size: { width: 2752, height: 1536 },
  widths: [1376, 2064, 2752],
} as const;

export const BOOKSHOP_V1_HOTSPOTS: readonly FrozenHotspot[] = [
  h(1, 2.8, 79.2, 5.6, 9.4, [[0, 0], [62, 5], [100, 96], [12, 100]]),
  h(2, 8.7, 79.1, 6.0, 10.8, [[0, 0], [73.2, 5], [100, 88.8], [100, 94.1], [24.4, 100]]),
  h(3, 14.8, 79.4, 4.8, 11.2, [[0, 8.9], [0, 0.1], [76.5, 5], [100, 80.6], [100, 94.3], [21.3, 100]]),
  h(4, 19.7, 80.6, 6.0, 11.1, [[0, 7.5], [0, 0.1], [73.6, 3], [100, 94], [20.7, 100]]),
  h(5, 26.0, 81.0, 6.4, 11.6, [[0, 0], [75, 5], [100, 94], [22, 100]]),
  h(6, 26.5, 33.9, 3.3, 7.0, [[6, 0], [100, 0], [94, 100], [0, 100]]),
  h(7, 27.7, 43.9, 2.2, 5.9, [[8, 0], [100, 0], [94, 100], [0, 100]]),
  h(8, 17.3, 49.8, 3.1, 5.7, [[0, 14], [80, 0], [100, 85], [20, 100]]),
  h(9, 35.1, 80.9, 8.7, 6.4, [[0, 64], [31, 0], [58, 10], [78, 3], [100, 49], [91, 91], [51, 100]]),
  h(10, 39.1, 65.9, 5.6, 4.8, [[0, 51], [40, 0], [69, 5], [100, 51], [57, 100], [18, 84]]),
  h(11, 41.8, 42.6, 3.3, 7.1, [[0, 8], [82, 0], [100, 94], [12, 100]]),
  h(12, 70.9, 63.0, 5.8, 11.5, [[21, 0], [100, 13], [74, 100], [0, 87]]),
  h(13, 78.5, 59.7, 4.6, 11.2, [[0, 10], [81.4, 0], [100, 51.1], [100, 88.9], [26, 100]]),
  h(14, 83.2, 57.1, 5.0, 10.3, [[0, 48.6], [0, 8.5], [66.4, 0], [100, 84], [16, 100]]),
  h(15, 68.9, 75.6, 4.9, 10.6, [[22, 0], [100, 13], [78, 100], [0, 85]]),
  h(16, 80.6, 71.8, 4.1, 7.6, [[0, 11], [68, 0], [100, 66.6], [100, 88.6], [28.5, 100]]),
  h(17, 84.8, 70.8, 4.0, 10.4, [[0, 39.2], [0, 10.4], [66.8, 0], [100, 64.6], [100, 85.8], [22.4, 100]]),
  h(18, 88.9, 66.5, 3.8, 10.5, [[0, 34.2], [0, 10.6], [62.2, 0], [100, 85], [23.4, 100]]),
  h(19, 68.0, 87.4, 5.1, 10.1, [[21, 0], [100, 11], [80, 100], [0, 85]]),
  h(20, 73.5, 91.1, 4.6, 8.8, [[17, 0], [100, 11.1], [85.2, 100], [75.4, 100], [0, 91]]),
  h(21, 56.4, 46.1, 3.1, 6.8, [[23.4, 0], [100, 12], [100, 38.1], [84.1, 100], [0, 88]]),
  h(22, 59.6, 46.8, 3.0, 7.2, [[0, 75.5], [22, 0], [100, 12], [100, 35.9], [81.4, 100], [0, 87.5]]),
  h(23, 62.7, 47.7, 3.0, 7.3, [[0, 65.9], [20.8, 0], [100, 12.5], [100, 24.5], [78, 100], [0, 88]]),
  h(24, 65.8, 49.5, 3.0, 7.3, [[0, 55.4], [17.5, 0], [100, 13], [74.7, 100], [0, 88.5]]),
  h(25, 52.1, 24.1, 3.5, 6.7, [[16, 0], [100, 5], [85, 100], [0, 97]]),
];

/** The seed's book order is the placeholder popularityRank 1–25; the value is the slot the old seed gave it. */
export const BOOKSHOP_V1_PLACEMENT: ReadonlyArray<{ slug: string; slot: number }> = [
  { slug: "the-hobbit", slot: 6 },
  { slug: "1984", slot: 14 },
  { slug: "fahrenheit-451", slot: 25 },
  { slug: "brave-new-world", slot: 4 },
  { slug: "animal-farm", slot: 3 },
  { slug: "the-great-gatsby", slot: 12 },
  { slug: "to-kill-a-mockingbird", slot: 8 },
  { slug: "the-catcher-in-the-rye", slot: 2 },
  { slug: "the-odyssey", slot: 21 },
  { slug: "stardust", slot: 7 },
  { slug: "the-night-circus", slot: 18 },
  { slug: "frankenstein", slot: 13 },
  { slug: "dracula", slot: 11 },
  { slug: "jane-eyre", slot: 20 },
  { slug: "wuthering-heights", slot: 19 },
  { slug: "dune", slot: 10 },
  { slug: "foundation", slot: 16 },
  { slug: "hyperion", slot: 23 },
  { slug: "neuromancer", slot: 22 },
  { slug: "the-name-of-the-wind", slot: 5 },
  { slug: "a-game-of-thrones", slot: 1 },
  { slug: "a-wizard-of-earthsea", slot: 24 },
  { slug: "good-omens", slot: 15 },
  { slug: "the-shadow-of-the-wind", slot: 9 },
  { slug: "the-starless-sea", slot: 17 },
];
