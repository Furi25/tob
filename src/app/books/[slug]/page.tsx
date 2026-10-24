import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookCover } from "@/components/book/BookCover";
import { BookShell } from "@/components/book/BookShell";
import styles from "@/components/book/book.module.css";
import { getBookBySlug, slugSchema } from "@/server/books";

// Always reads the current row; no loading.tsx so notFound() still sends a 404 status.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function findBook(params: Props["params"]) {
  const parsed = slugSchema.safeParse((await params).slug);
  return parsed.success ? getBookBySlug(parsed.data) : null;
}

const filled = (text: string | null): text is string => !!text && text.trim() !== "";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = await findBook(params);
  if (!book) return { title: "Book not found · Tree of Books" };
  return {
    title: `${book.title} by ${book.author} · Tree of Books`,
    // An empty summary keeps the site-wide description from the root layout.
    ...(filled(book.summary) ? { description: book.summary } : {}),
  };
}

export default async function BookPage({ params }: Props) {
  const book = await findBook(params);
  if (!book) notFound();

  const sections = [
    { heading: "What it's about", body: book.about },
    { heading: "Why people are reading it", body: book.whyPopular },
    { heading: "Why it matters", body: book.whyItMatters },
    { heading: "About the author", body: book.authorBio },
  ];

  return (
    <BookShell palette={book.palette}>
      <div className={styles.layout}>
        <div className={styles.coverColumn}>
          <BookCover title={book.title} author={book.author} coverImage={book.coverImage} />
        </div>
        <article>
          <h1 className={styles.title}>{book.title}</h1>
          <p className={styles.byline}>by {book.author}</p>
          {filled(book.tagline) && <p className={styles.tagline}>{book.tagline}</p>}
          {sections.map(({ heading, body }) =>
            filled(body) ? (
              <section key={heading} className={styles.section}>
                <h2>{heading}</h2>
                <p>{body}</p>
              </section>
            ) : null,
          )}
          <div className={styles.buy}>
            {book.buyUrl ? (
              <>
                <a className={styles.buyLink} href={book.buyUrl} rel="sponsored">
                  Buy {book.title}
                </a>
                <p className={styles.note}>We may earn a commission if you buy through this link.</p>
              </>
            ) : (
              <p className={styles.note}>Buying links are coming soon.</p>
            )}
          </div>
        </article>
      </div>
    </BookShell>
  );
}
