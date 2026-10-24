import styles from "./book.module.css";

type Props = { title: string; author: string; coverImage: string | null };

/** The book's cover, or a placeholder hardcover lettered with its title and author. */
export function BookCover({ title, author, coverImage }: Props) {
  if (coverImage) {
    return (
      <div className={styles.coverFrame}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local file of unknown size; next/image would need a client component and fixed dimensions */}
        <img className={styles.coverImage} src={coverImage} alt={`Cover of ${title}`} />
      </div>
    );
  }
  // Decorative: the <h1> and by-line already carry the title and author.
  return (
    <div className={styles.cover} aria-hidden="true">
      <span className={styles.coverTitle}>{title}</span>
      <span className={styles.coverAuthor}>{author}</span>
    </div>
  );
}
