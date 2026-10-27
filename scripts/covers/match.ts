// Title and author matching for Open Library and Google Books (docs/specs/book-cover-fetcher.md, "Matching rule").

/** Diacritics removed, lower case, `&` as "and", every other non-alphanumeric run as one space. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dropLeadingArticle(normalized: string): string {
  const rest = normalized.replace(/^(?:the|an|a) /, "");
  return rest.length > 0 ? rest : normalized;
}

const key = (title: string) => dropLeadingArticle(normalize(title));

/** Where a subtitle can start in a candidate title: `Dune: Deluxe Edition`, `Title - Edition`, `Title (Edition)`. */
const SUBTITLE_START = /[:;(\[\u2013\u2014]| - /g;

/**
 * A candidate matches when its title equals the list title, or when the list title is the part before a subtitle
 * ("Dune: Deluxe Edition"). A candidate that merely contains the title ("SparkNotes: The Hobbit") or continues it
 * without a subtitle mark ("The Hobbit Companion") does not match.
 */
export function titleMatches(listTitle: string, candidateTitle: string): boolean {
  const wanted = key(listTitle);
  if (wanted.length === 0 || normalize(candidateTitle).length === 0) return false;
  if (key(candidateTitle) === wanted) return true;
  for (const mark of candidateTitle.matchAll(SUBTITLE_START)) {
    if (key(candidateTitle.slice(0, mark.index)) === wanted) return true;
  }
  return false;
}

/** The individual authors of a list entry: `Neil Gaiman & Terry Pratchett`, `A, B`, `A and B`. */
export function splitAuthors(listAuthor: string): string[] {
  return listAuthor
    .split(/&|,|;|\band\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** The surname (last word) of one author, as written. */
export function surnameOf(author: string): string {
  return author.trim().split(/\s+/).at(-1) ?? "";
}

/** The surname of at least one list author must appear as a whole word in at least one candidate author. */
export function authorMatches(listAuthor: string, candidateAuthors: readonly string[]): boolean {
  const surnames = splitAuthors(listAuthor)
    .map((author) => normalize(author).split(" ").at(-1) ?? "")
    .filter((surname) => surname.length > 0);
  const candidateWords = candidateAuthors.map((author) => new Set(normalize(author).split(" ")));
  return surnames.some((surname) => candidateWords.some((words) => words.has(surname)));
}
