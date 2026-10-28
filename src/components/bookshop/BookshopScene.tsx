import { Fragment, type CSSProperties } from "react";
import type { DisplayBook } from "@/server/display";
import { HotspotLabel } from "./HotspotLabel";
import { shapeClipPath, shapePoints, type Hotspot } from "./hotspots";
import { artworkPath, type Scene } from "./scenes";
import styles from "./bookshop.module.css";

const srcSetOf = (scene: Scene) => scene.artwork.widths.map((w) => `${artworkPath(scene, w)} ${w}w`).join(", ");
// Matches the scene's width rule (bookshop.module.css): the smallest of the content area (viewport minus
// 2×16px padding), the free height times the artwork's ratio (viewport height minus the 96px page chrome in
// page.module.css). There is no width cap (docs/specs/bookshop-scene-scaling.md).
const sizesOf = ({ artwork }: Scene) =>
  `min(calc(100vw - 32px), calc((100vh - 96px) * ${artwork.size.width} / ${artwork.size.height}))`;

const rectVars = ({ rect }: Hotspot) =>
  ({
    "--top": `${rect.top}%`,
    "--left": `${rect.left}%`,
    "--width": `${rect.width}%`,
    "--height": `${rect.height}%`,
  }) as CSSProperties;

/** Each book's glint starts at a different point of its edge. */
const GLINT_STEP_SECONDS = 0.37;

const edgeVars = (spot: Hotspot) =>
  ({ ...rectVars(spot), "--glint-delay": `${(-(spot.slot - 1) * GLINT_STEP_SECONDS).toFixed(2)}s` }) as CSSProperties;

type BookshopSceneProps = { scene: Scene; books: DisplayBook[]; showOverlay: boolean };

export function BookshopScene({ scene, books, showOverlay }: BookshopSceneProps) {
  const spots = new Map(scene.hotspots.map((h) => [h.slot, h]));
  const { width, height } = scene.artwork.size;
  // Unitless numbers: the stylesheet turns them into the aspect ratio and the fit-the-window width.
  const sceneVars = { "--art-w": width, "--art-h": height } as CSSProperties;

  return (
    <div className={styles.scene} style={sceneVars} data-bookshop-scene="">
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot serve this pre-made srcset without re-encoding (spec: Assets) */}
      <img
        className={styles.artwork}
        src={artworkPath(scene, scene.artwork.widths[1])}
        srcSet={srcSetOf(scene)}
        sizes={sizesOf(scene)}
        width={width}
        height={height}
        fetchPriority="high"
        alt={scene.alt}
      />
      {books.map((book) => {
        const spot = spots.get(book.slot);
        if (!spot) return null;
        const points = shapePoints(spot.shape);
        // The edge and the focus ring are siblings of the link, never children: the link is clipped to the
        // silhouette, and a clip would cut off anything inside it. The CSS relies on this order (a + edge + ring).
        return (
          <Fragment key={book.slot}>
            <a
              href={`/books/${book.slug}`}
              className={styles.hotspot}
              style={{ ...rectVars(spot), clipPath: shapeClipPath(spot.shape) }}
              data-hotspot=""
              data-title={book.title}
              data-author={book.author}
            >
              <span className={styles.srOnly}>{`${book.title} by ${book.author}`}</span>
            </a>
            <svg
              className={styles.edge}
              style={edgeVars(spot)}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              data-hotspot-edge=""
            >
              <polygon className={styles.edgeBase} points={points} pathLength={100} data-edge="base" />
              <polygon className={styles.edgeGlint} points={points} pathLength={100} data-edge="glint" />
            </svg>
            <svg
              className={styles.focusRing}
              style={rectVars(spot)}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              data-hotspot-focus=""
            >
              <polygon className={styles.ringOuter} points={points} data-ring="outer" />
              <polygon className={styles.ringInner} points={points} data-ring="inner" />
            </svg>
          </Fragment>
        );
      })}
      {showOverlay
        ? scene.hotspots.map((spot) => (
            <div key={spot.slot} className={styles.overlaySpot} style={rectVars(spot)} aria-hidden="true">
              <svg className={styles.overlayShape} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points={shapePoints(spot.shape)} />
              </svg>
              <span className={styles.overlayNumber}>{spot.slot}</span>
            </div>
          ))
        : null}
      <HotspotLabel />
    </div>
  );
}
