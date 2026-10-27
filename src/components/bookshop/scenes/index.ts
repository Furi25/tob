// The scene registry (docs/specs/multiple-bookshop-scenes.md). Registry order is switcher order.
// To add a scene: put its master in docs/scenes/, add a file here with its data, list it below, run
// `npm run assets:scene -- <id>`, and add its books to prisma/seed.ts.
import { abbey } from "./abbey";
import { bookshop } from "./bookshop";
import type { Scene } from "./types";

export type { Scene } from "./types";

export const SCENES: readonly Scene[] = [bookshop, abbey];

/** The scene at `/`. It is the first one in `SCENES`. */
export const DEFAULT_SCENE: Scene = bookshop;
export const DEFAULT_SCENE_ID = DEFAULT_SCENE.id;

/** The scene with exactly this id, or undefined. Never matches inherited keys such as `constructor`. */
export function getScene(id: string): Scene | undefined {
  return SCENES.find((scene) => scene.id === id);
}

/** Where a scene lives: `/` for the default scene, `/shops/{id}` for the others. */
export function sceneHref(scene: Scene): string {
  return scene.id === DEFAULT_SCENE_ID ? "/" : `/shops/${scene.id}`;
}

/** Path of one served file of a scene's artwork. */
export function artworkPath(scene: Scene, width: number): string {
  return `/bookshop/${scene.id}@${scene.artwork.version}-${width}.webp`;
}
