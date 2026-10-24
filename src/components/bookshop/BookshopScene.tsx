import { Fragment, type CSSProperties } from "react";
import type { DisplayBook } from "@/server/display";
import { HotspotLabel } from "./HotspotLabel";
import {
  ARTWORK_SIZE,
  ARTWORK_VERSION,
  ARTWORK_WIDTHS,
  HOTSPOTS,
  shapeClipPath,
  shapePoints,
  type Hotspot,
} from "./hotspots";
import styles from "./bookshop.module.css";

const SRC_SET = ARTWORK_WIDTHS.map((w) => `/bookshop/scene@${ARTWORK_VERSION}-${w}.webp ${w}w`).join(", ");
// Matches the scene's width rule: the content area (viewport minus 2×16px padding), capped at 1920px.
const SIZES = "(min-width: 1952px) 1920px, calc(100vw - 32px)";

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

type BookshopSceneProps = { books: DisplayBook[]; showOverlay: boolean };

export function BookshopScene({ books, showOverlay }: BookshopSceneProps) {
  const spots = new Map(HOTSPOTS.map((h) => [h.slot, h]));

  return (
    <div className={styles.scene} data-bookshop-scene="">
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot serve this pre-made srcset without re-encoding (spec: Assets) */}
      <img
        className={styles.artwork}
        src={`/bookshop/scene@${ARTWORK_VERSION}-${ARTWORK_WIDTHS[1]}.webp`}
        srcSet={SRC_SET}
        sizes={SIZES}
        width={ARTWORK_SIZE.width}
        height={ARTWORK_SIZE.height}
        fetchPriority="high"
        alt="A sunlit pixel-art bookshop with books on the shelves, a low table, a display stand and the counter."
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
        ? HOTSPOTS.map((spot) => (
            <div key={spot.slot} className={styles.overlaySpot} style={rectVars(spot)} aria-hidden="true">
              <span className={styles.overlayNumber}>{spot.slot}</span>
            </div>
          ))
        : null}
      <HotspotLabel />
    </div>
  );
}
