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

const roman = (n: number) => ["", "I", "II", "III", "IV"][n] ?? String(n);
const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

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

  const shown = sections.filter((s): s is { heading: string; body: string } => filled(s.body));

  const left = (
    <>
      <div className={styles.coverSlot}>
        <BookCover title={book.title} author={book.author} coverImage={book.coverImage} />
      </div>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>{book.title}</h1>
        <p className={styles.byline}>by {book.author}</p>
        {filled(book.tagline) && <p className={styles.tagline}>{book.tagline}</p>}
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
      </div>
    </>
  );

  const right = (
    <>
      <div className={styles.running} aria-hidden="true">
        {book.title} · {book.author}
      </div>
      <div className={styles.pane} role="region" aria-label={`About ${book.title}`} tabIndex={0}>
        {shown.map(({ heading, body }, i) => (
          <section key={heading} className={styles.section}>
            <h2>
              <small className={styles.chapter} aria-hidden="true">
                Chapter {roman(i + 1)}
              </small>
              <span className={styles.heading}>{heading}</span>
            </h2>
            {paragraphs(body).map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </section>
        ))}
      </div>
    </>
  );

  return <BookShell palette={book.palette} left={left} right={right} />;
}
