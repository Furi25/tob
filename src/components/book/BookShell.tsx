import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { artworkPath, DEFAULT_SCENE } from "@/components/bookshop/scenes";
import styles from "./book.module.css";

export type ShellPalette = { primary: string; surface: string; text: string; highlight: string };

// The default scene's smallest file, whichever scene the reader came from.
const BACKDROP = `url(${artworkPath(DEFAULT_SCENE, DEFAULT_SCENE.artwork.widths[0])})`;

/** Page frame for /books/*: the dimmed bookshop behind a solid panel in the book's palette. */
export function BookShell({ palette, children }: { palette: ShellPalette; children: ReactNode }) {
  // Palette values are validated as #rrggbb before they get here, so they cannot inject CSS.
  const vars = {
    "--book-primary": palette.primary,
    "--book-surface": palette.surface,
    "--book-text": palette.text,
    "--book-highlight": palette.highlight,
    "--book-backdrop": BACKDROP,
  } as CSSProperties;

  return (
    <div className={styles.page} style={vars}>
      <main className={styles.panel}>
        <Link href="/" className={styles.back}>
          <span aria-hidden="true">← </span>Back to the shop
        </Link>
        {children}
      </main>
    </div>
  );
}
