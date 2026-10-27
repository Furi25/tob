// The Abbey's 29 hand-measured boxes, [x1, y1, x2, y2] in px of the 2752×1536 master docs/scenes/gothic.png.
// Copied from docs/specs/multiple-bookshop-scenes.md, Appendix. Precision is ±4 master px (Hotspot Coordinates).
// If the appendix changes, update this file in the same commit.

export type PixelBox = readonly [x1: number, y1: number, x2: number, y2: number];

export const ABBEY_MASTER_SIZE = { width: 2752, height: 1536 } as const;

export const ABBEY_BOXES: Readonly<Record<number, PixelBox>> = {
  1: [330, 843, 443, 970],
  2: [470, 814, 578, 933],
  3: [601, 769, 718, 888],
  4: [1228, 373, 1290, 455],
  5: [1310, 355, 1382, 455],
  6: [1481, 369, 1552, 455],
  7: [1235, 527, 1312, 621],
  8: [1327, 543, 1394, 623],
  9: [1405, 537, 1476, 623],
  10: [1493, 533, 1563, 615],
  11: [761, 968, 865, 1089],
  12: [951, 964, 1052, 1103],
  13: [1440, 769, 1540, 894],
  14: [1351, 943, 1413, 1046],
  15: [1454, 958, 1520, 1054],
  16: [1548, 943, 1620, 1046],
  17: [1437, 1355, 1600, 1448],
  18: [2086, 937, 2229, 1120],
  19: [1903, 1200, 2010, 1355],
  20: [2044, 1237, 2157, 1386],
  21: [2235, 1226, 2366, 1376],
  22: [2180, 492, 2262, 597],
  23: [2281, 503, 2349, 594],
  24: [2375, 509, 2442, 599],
  25: [2460, 509, 2527, 599],
  26: [2186, 675, 2255, 770],
  27: [2278, 669, 2348, 764],
  28: [2363, 673, 2432, 768],
  29: [2456, 675, 2526, 768],
};

export const ABBEY_SLOT_COUNT = Object.keys(ABBEY_BOXES).length;
