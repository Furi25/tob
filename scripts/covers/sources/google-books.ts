// Google Books (docs/specs/book-cover-fetcher.md, "Sources"). Only used with an API key, and the key goes to
// www.googleapis.com only: it is never part of a candidate URL, so it can't reach the report.
import { z } from "zod";
import type { BookEntry } from "../list";
import type { Budget, Http } from "../http";
import { authorMatches, splitAuthors, titleMatches } from "../match";
import { getJson, isLookup, MAX_CANDIDATES, PUBLISHER_RIGHTS, type Candidate, type Lookup } from "./types";

const VolumesSchema = z.object({
  items: z
    .array(
      z.object({
        volumeInfo: z.object({
          title: z.string().optional(),
          authors: z.array(z.string()).optional(),
          imageLinks: z.record(z.string(), z.string()).optional(),
        }),
      }),
    )
    .optional(),
});

// Largest first.
const SIZES = ["extraLarge", "large", "medium", "small", "thumbnail", "smallThumbnail"] as const;

/** https instead of http, and no page-curl effect. Other parameters are kept as they are. */
function cleanImageUrl(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol === "http:") url.protocol = "https:";
    url.searchParams.delete("edge");
    return url.href;
  } catch {
    return null;
  }
}

export async function lookupGoogleBooks(book: BookEntry, apiKey: string, http: Http, budget: Budget): Promise<Lookup> {
  const query = new URLSearchParams({
    q: book.isbn !== null ? `isbn:${book.isbn}` : `intitle:${book.title} inauthor:${splitAuthors(book.author)[0] ?? book.author}`,
    maxResults: "5",
    key: apiKey,
  });
  const volumes = await getJson(http, `https://www.googleapis.com/books/v1/volumes?${query.toString()}`, VolumesSchema, budget);
  if (isLookup(volumes)) return volumes;

  const matching = (volumes.data.items ?? []).filter(
    ({ volumeInfo }) => volumeInfo.title !== undefined && titleMatches(book.title, volumeInfo.title) && authorMatches(book.author, volumeInfo.authors ?? []),
  );
  if (matching.length === 0) return { kind: "none", outcome: "no-match" };

  const candidates: Candidate[] = [];
  for (const { volumeInfo } of matching) {
    const links = volumeInfo.imageLinks;
    const size = links ? SIZES.find((name) => links[name] !== undefined) : undefined;
    const url = links && size ? cleanImageUrl(links[size]) : null;
    if (url !== null) candidates.push({ url, rights: PUBLISHER_RIGHTS });
  }
  return candidates.length > 0 ? { kind: "candidates", candidates: candidates.slice(0, MAX_CANDIDATES) } : { kind: "none", outcome: "no-cover" };
}
