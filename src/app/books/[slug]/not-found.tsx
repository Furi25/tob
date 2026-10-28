import { BookShell } from "@/components/book/BookShell";
import styles from "@/components/book/book.module.css";
import { DEFAULT_PALETTE } from "@/server/books";

export default function BookNotFound() {
  return (
    <BookShell
      palette={DEFAULT_PALETTE}
      left={
        <div className={styles.titleBlock} style={{ margin: "auto 0" }}>
          <h1 className={styles.title}>We couldn&apos;t find that book.</h1>
        </div>
      }
      right={
        <div className={`${styles.notFound} ${styles.titleBlock}`} style={{ margin: "auto 0" }}>
          <p>It may have left the display, or the link has a typo.</p>
        </div>
      }
    />
  );
}
