// The Abbey: a gothic library (docs/specs/multiple-bookshop-scenes.md, Appendix: Abbey coordinates).
// Each book is a box [x1, y1, x2, y2] measured in pixels of the 2752×1536 master, docs/scenes/gothic.png, with the
// box editor in mockups/abbey-display/. The slot number is the index + 1, in the author's reading order.
// To correct a book, change its numbers here; nothing is converted by hand. Add books at the end (slots 30 and up),
// so existing slots and the Tab order do not change.
import { hotspotFromPixels, type Hotspot } from "../hotspots";
import type { Scene } from "./types";

const MASTER = { width: 2752, height: 1536 } as const;

const BOXES: readonly (readonly [x1: number, y1: number, x2: number, y2: number])[] = [
  [330, 843, 443, 970],
  [470, 814, 578, 933],
  [601, 769, 718, 888],
  [1228, 373, 1290, 455],
  [1310, 355, 1382, 455],
  [1481, 369, 1552, 455],
  [1235, 527, 1312, 621],
  [1327, 543, 1394, 623],
  [1405, 537, 1476, 623],
  [1493, 533, 1563, 615],
  [761, 968, 865, 1089],
  [951, 964, 1052, 1103],
  [1440, 769, 1540, 894],
  [1351, 943, 1413, 1046],
  [1454, 958, 1520, 1054],
  [1548, 943, 1620, 1046],
  [1437, 1355, 1600, 1448],
  [2086, 937, 2229, 1120],
  [1903, 1200, 2010, 1355],
  [2044, 1237, 2157, 1386],
  [2235, 1226, 2366, 1376],
  [2180, 492, 2262, 597],
  [2281, 503, 2349, 594],
  [2375, 509, 2442, 599],
  [2460, 509, 2527, 599],
  [2186, 675, 2255, 770],
  [2278, 669, 2348, 764],
  [2363, 673, 2432, 768],
  [2456, 675, 2526, 768],
];

// A rectangle is a 4-point polygon, so there is a single code path.
const hotspots: readonly Hotspot[] = BOXES.map(([x1, y1, x2, y2], index) =>
  hotspotFromPixels(
    index + 1,
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ],
    MASTER,
    undefined,
    MASTER,
  ),
);

export const abbey: Scene = {
  id: "abbey",
  name: "The Abbey",
  alt: "The abbey's library",
  artwork: {
    version: "v1",
    master: "docs/scenes/gothic.png",
    size: MASTER,
    widths: [1376, 2064, 2752],
  },
  hotspots,
};
