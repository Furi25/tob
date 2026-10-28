import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { artworkPath, DEFAULT_SCENE } from "@/components/bookshop/scenes";
import { PARCHMENT } from "@/server/books";
import { OPEN_BOOK, openBookPath } from "./openBook";
import styles from "./book.module.css";

export type ShellPalette = { primary: string; surface: string; text: string; highlight: string };

// The default scene's 2064px file, whichever scene the reader came from: the shop stays visible behind the book.
const BACKDROP = `url(${artworkPath(DEFAULT_SCENE, DEFAULT_SCENE.artwork.widths[1])})`;

const SRC_SET = OPEN_BOOK.widths.map((w) => `${openBookPath(w)} ${w}w`).join(", ");
// The stage's width rule (book.module.css): the smaller of the viewport and the free height times the ratio.
const SIZES = `min(1920px, 100vw, calc((100vh - 5.5rem) * ${OPEN_BOOK.size.width} / ${OPEN_BOOK.size.height}))`;

const pageVars = (page: { left: number; top: number; width: number; height: number }) =>
  ({
    "--left": `${page.left}%`,
    "--top": `${page.top}%`,
    "--width": `${page.width}%`,
    "--height": `${page.height}%`,
  }) as CSSProperties;

type Props = { palette: ShellPalette; left: ReactNode; right: ReactNode };

/** Page frame for /books/*: the shop behind an open book. `left` and `right` are the two pages' content. */
export function BookShell({ palette, left, right }: Props) {
  // Palette values are validated as #rrggbb before they get here, so they cannot inject CSS.
  const vars = {
    "--book-primary": palette.primary,
    "--book-surface": palette.surface,
    "--book-text": palette.text,
    "--book-highlight": palette.highlight,
    "--book-parchment": PARCHMENT,
    "--book-backdrop": BACKDROP,
    "--art-w": OPEN_BOOK.size.width,
    "--art-h": OPEN_BOOK.size.height,
  } as CSSProperties;

  return (
    <div className={styles.page} style={vars} data-book-style="default">
      <Link href="/" className={styles.back}>
        Back to the shop
      </Link>
      <main className={styles.stage}>
        <div className={styles.paper}>
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-made srcset (see BookshopScene) */}
          <img
            className={styles.art}
            src={openBookPath(OPEN_BOOK.widths[1])}
            srcSet={SRC_SET}
            sizes={SIZES}
            width={OPEN_BOOK.size.width}
            height={OPEN_BOOK.size.height}
            alt=""
            fetchPriority="high"
          />
          <div className={`${styles.leaf} ${styles.leftLeaf}`} style={pageVars(OPEN_BOOK.pages.left)}>
            {left}
          </div>
          <div className={`${styles.leaf} ${styles.rightLeaf}`} style={pageVars(OPEN_BOOK.pages.right)}>
            {right}
          </div>
        </div>
      </main>
    </div>
  );
}
