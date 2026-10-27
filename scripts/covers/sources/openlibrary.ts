// Open Library (docs/specs/book-cover-fetcher.md, "Sources"). Covers are always asked for by cover id: the
// /b/isbn, /b/oclc and /b/lccn forms are rate-limited by Open Library and are never used.
import { z } from "zod";
import type { BookEntry } from "../list";
import type { Budget, Http } from "../http";
import { authorMatches, splitAuthors, titleMatches } from "../match";
import { getJson, isLookup, MAX_CANDIDATES, PUBLISHER_RIGHTS, type Candidate, type Lookup } from "./types";

const EditionSchema = z.object({ covers: z.array(z.number().int()).optional() });
const SearchSchema = z.object({
  docs: z.array(
    z.object({
      title: z.string().optional(),
      author_name: z.array(z.string()).optional(),
      cover_i: z.number().int().optional(),
    }),
  ),
});

const coverUrl = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`;
const toCandidates = (ids: number[]): Candidate[] => ids.slice(0, MAX_CANDIDATES).map((id) => ({ url: coverUrl(id), rights: PUBLISHER_RIGHTS }));

export async function lookupOpenLibrary(book: BookEntry, http: Http, budget: Budget): Promise<Lookup> {
  if (book.isbn !== null) {
    const edition = await getJson(http, `https://openlibrary.org/isbn/${book.isbn}.json`, EditionSchema, budget);
    if (isLookup(edition)) return edition;
    const ids = (edition.data.covers ?? []).filter((id) => id > 0);
    return ids.length > 0 ? { kind: "candidates", candidates: toCandidates(ids) } : { kind: "none", outcome: "no-cover" };
  }

  const query = new URLSearchParams({
    title: book.title,
    author: splitAuthors(book.author)[0] ?? book.author,
    limit: "5",
    fields: "key,title,author_name,cover_i",
  });
  const search = await getJson(http, `https://openlibrary.org/search.json?${query.toString()}`, SearchSchema, budget);
  if (isLookup(search)) return search;

  const matching = search.data.docs.filter(
    (doc) => doc.title !== undefined && titleMatches(book.title, doc.title) && authorMatches(book.author, doc.author_name ?? []),
  );
  if (matching.length === 0) return { kind: "none", outcome: "no-match" };
  const ids = matching.flatMap((doc) => (doc.cover_i !== undefined && doc.cover_i > 0 ? [doc.cover_i] : []));
  return ids.length > 0 ? { kind: "candidates", candidates: toCandidates(ids) } : { kind: "none", outcome: "no-cover" };
}
