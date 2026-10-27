// Wikimedia Commons (docs/specs/book-cover-fetcher.md, "Sources"). Only freely licensed files are used, and the
// licence text goes into the report as the rights note.
import { z } from "zod";
import type { BookEntry } from "../list";
import type { Budget, Http } from "../http";
import { splitAuthors, surnameOf } from "../match";
import { getJson, isLookup, MAX_CANDIDATES, type Candidate, type Lookup } from "./types";

const PageSchema = z.object({
  title: z.string(),
  index: z.number().optional(),
  imageinfo: z
    .array(z.object({ url: z.string(), mime: z.string().optional(), extmetadata: z.unknown().optional() }))
    .optional(),
});
const ResponseSchema = z.object({ query: z.object({ pages: z.record(z.string(), PageSchema).optional() }).optional() });
const LicenceSchema = z.object({ LicenseShortName: z.object({ value: z.string() }) });

const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** CC0, CC BY, CC BY-SA and public domain. NonCommercial, NoDerivatives, fair use and unknown licences are refused. */
const FREE_LICENCES = [/^cc0/i, /^cc[- ]by(?:[- ]sa)?(?:[- ]\d|$)/i, /^public domain/i, /^pd[- ]/i];

const words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0);

export async function lookupCommons(book: BookEntry, http: Http, budget: Budget): Promise<Lookup> {
  const surname = surnameOf(splitAuthors(book.author)[0] ?? book.author);
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${book.title} ${surname} cover`,
    gsrnamespace: "6",
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiextmetadatafilter: "LicenseShortName",
  });
  const response = await getJson(http, `https://commons.wikimedia.org/w/api.php?${query.toString()}`, ResponseSchema, budget);
  if (isLookup(response)) return response;

  const titleWords = words(book.title);
  const pages = Object.values(response.data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const candidates: Candidate[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !info.mime || !MIME_TYPES.has(info.mime.toLowerCase())) continue;
    const nameWords = new Set(words(page.title.replace(/^File:/i, "")));
    if (!nameWords.has("cover") || !titleWords.every((word) => nameWords.has(word))) continue;
    const licence = LicenceSchema.safeParse(info.extmetadata);
    if (!licence.success) continue;
    const text = licence.data.LicenseShortName.value.trim();
    if (!FREE_LICENCES.some((pattern) => pattern.test(text))) continue;
    candidates.push({ url: info.url, rights: `Wikimedia Commons file, licence: ${text}.` });
  }
  return candidates.length > 0 ? { kind: "candidates", candidates: candidates.slice(0, MAX_CANDIDATES) } : { kind: "none", outcome: "no-match" };
}
