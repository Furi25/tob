import type { DisplayBook } from "@/server/display";
import styles from "./drawer.module.css";

const LIST_ID = "display-list";

/**
 * "All N on display" button and the sidebar list, built on the native Popover API so it works
 * without client JS. Focus handling is the browser's own (see spec: DisplayDrawer → Focus).
 */
export function DisplayDrawer({ books }: { books: DisplayBook[] }) {
  return (
    <>
      <button type="button" className={styles.toggle} popoverTarget={LIST_ID}>
        All {books.length} on display
      </button>
      <nav id={LIST_ID} popover="auto" aria-label="Books on display" className={styles.sidebar}>
        <div className={styles.header}>
          <p className={styles.heading}>On display</p>
          <button type="button" className={styles.close} popoverTarget={LIST_ID} popoverTargetAction="hide">
            Close
          </button>
        </div>
        <ol className={styles.list}>
          {books.map((book) => (
            <li key={book.slot}>
              <a href={`/books/${book.slug}`} className={styles.link}>
                {`${book.title} — ${book.author}`}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
