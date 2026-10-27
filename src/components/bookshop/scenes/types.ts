import type { Hotspot } from "../hotspots";

export type Scene = {
  /** Kebab-case, unique. URL segment, file prefix and `Placement.sceneId`. */
  id: string;
  /** The switcher label, 1–3 words. */
  name: string;
  /** Alt text of the artwork. */
  alt: string;
  artwork: {
    /** Changes whenever the master changes, e.g. "v1". Part of the served file names. */
    version: string;
    /** Repo-relative path of the master image, for the asset script and tests. */
    master: string;
    /** The master's intrinsic pixels. Sets the scene's aspect ratio. */
    size: { width: number; height: number };
    /** 50%, 75% and 100% of the master width, rounded. Served as public/bookshop/{id}@{version}-{width}.webp. */
    widths: readonly [number, number, number];
  };
  /** Slots 1..N, N = hotspots.length. */
  hotspots: readonly Hotspot[];
};
