// Shared helpers for the cover-fetcher tests (docs/specs/book-cover-fetcher.md).
//
// ASSUMED MODULE CONTRACTS. The spec fixes file names and behaviour but only sketches signatures ("illustrative").
// The tests assume the following; if the implementer picks others, adapt the call sites in one place and tell the
// architect to pin them in the spec.
//
//   src/lib/slug.ts            slugify(title: string): string
//   scripts/covers/list.ts     parseBookList(text: string):
//                                { ok: true; books: BookEntry[] } | { ok: false; errors: { line: number; message: string }[] }
//   scripts/covers/config.ts   loadConfig(env: Record<string, string | undefined>):
//                                { ok: true; config: { contact: string; googleBooksApiKey: string | null } }
//                              | { ok: false; errors: string[] }
//   scripts/covers/image.ts    normalizeCover(input: Buffer): Promise<
//                                { ok: true; png: Buffer; originalSize: Size; outputSize: Size; cropped: boolean }
//                              | { ok: false; reason: "bad-ratio" | "too-small" | "not-an-image" }>
//   scripts/covers/http.ts     createHttp({ contact, fetch?, sleep?, now? }).get(url, { kind: "json" | "image" }):
//                                Promise<{ ok: true; status: number; contentType: string | null; body: Buffer }
//                                      | { ok: false; outcome: string; status?: number; detail?: string }>   (never throws)
//   scripts/covers/match.ts    titleMatches(listTitle: string, candidateTitle: string): boolean
//                              authorMatches(listAuthor: string, candidateAuthors: readonly string[]): boolean
//   scripts/covers/run.ts      runCovers({ listText, outDir, force?, only?, config: { contact, googleBooksApiKey },
//                                          deps?: { fetch, sleep, now, signal? } }): Promise<{ exitCode: number }>
//                              and it writes <outDir>/images/<slug>.png and <outDir>/report.json.
//   scripts/covers/cli.ts      the entry point run as `tsx scripts/covers/cli.ts <list-file> [flags]`.
//
// Remote reply shapes are the documented ones: Open Library search.json docs ({ key, title, author_name, cover_i }),
// the Open Library edition JSON ({ covers: [id] }), Google Books volumes ({ items[].volumeInfo.{title,authors,imageLinks} })
// and the MediaWiki API ({ query.pages.<id>.{ title, imageinfo[0].{ url, mime, extmetadata } } }).
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { afterEach, beforeEach, vi } from "vitest";
import { z } from "zod";

export type Size = { width: number; height: number };

export const CONTACT = "tests@example.org";
export const USER_AGENT = `tree-of-books-covers/1.0 (${CONTACT})`;

/** Makes the real global fetch throw for every test in the calling file ("make real fetch throw if it is ever reached"). */
export function forbidRealFetch() {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("the real fetch was called: the tool must use the fetch it was given");
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Fake network: a fake fetch, a virtual clock and a fake sleep that advances it. No real I/O, no real waiting.
// ---------------------------------------------------------------------------------------------------------------

export type Call = {
  url: string;
  host: string;
  path: string;
  headers: Headers;
  /** Virtual time (ms) at which the request was made. */
  at: number;
  redirect: RequestRedirect | undefined;
};

export type Responder = (url: URL, call: Call, index: number) => Response | Promise<Response>;

export function createFakeNet(respond: Responder) {
  let clock = 1_000_000;
  const calls: Call[] = [];
  const sleeps: number[] = [];

  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const call: Call = {
      url: url.href,
      host: url.host,
      path: url.pathname,
      headers: new Headers(init?.headers ?? request?.headers),
      at: clock,
      redirect: init?.redirect ?? request?.redirect,
    };
    calls.push(call);
    return respond(url, call, calls.length - 1);
  };

  return {
    calls,
    sleeps,
    deps: {
      fetch: fakeFetch as typeof fetch,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
    },
  };
}

export const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

export const imageResponse = (body: Buffer, type = "image/jpeg") =>
  new Response(new Uint8Array(body), { status: 200, headers: { "content-type": type } });

export const failure = (code: number, headers: Record<string, string> = {}) => new Response("", { status: code, headers });

export const redirectTo = (location: string, code = 302) => new Response(null, { status: code, headers: { location } });

/** Query string as readable text, for assertions about what was searched for. */
export const readable = (url: URL) => decodeURIComponent(url.search.replace(/\+/g, " "));

// ---------------------------------------------------------------------------------------------------------------
// Images, made with sharp so no binary fixtures are checked in.
// ---------------------------------------------------------------------------------------------------------------

const BROWN = { r: 120, g: 80, b: 40 };

export const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: BROWN } }).jpeg({ quality: 90 }).toBuffer();

export const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: BROWN } }).png().toBuffer();

/** A valid cover-shaped JPEG (650×1000 = 0.65, inside the ±8% window and big enough). */
export const goodCover = () => jpeg(650, 1000);

/** What a good cover becomes: cropped to 2:3 at 650×975. */
export const GOOD_COVER_OUTPUT: Size = { width: 650, height: 975 };

export const RED: [number, number, number] = [255, 0, 0];
export const GREEN: [number, number, number] = [0, 255, 0];
export const BLUE: [number, number, number] = [0, 0, 255];
export const BAND = 40;

/**
 * A probe for centred cropping: the first and last BAND rows (axis "y") or columns (axis "x") are red and blue, the
 * rest is green. A crop that keeps the centre still shows red at one edge and blue at the other; a crop taken from one
 * side loses a band.
 */
export async function bandedPng(width: number, height: number, axis: "x" | "y"): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = axis === "y" ? y : x;
      const length = axis === "y" ? height : width;
      const [r, g, b] = at < BAND ? RED : at >= length - BAND ? BLUE : GREEN;
      raw.set([r, g, b], (y * width + x) * 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** The 2k×3k box the spec's crop rule gives, before any scaling to 800×1200. */
export function cropBox(width: number, height: number): Size {
  const k = Math.floor(Math.min(width / 2, height / 3));
  return { width: 2 * k, height: 3 * k };
}

export async function pixelAt(file: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

// ---------------------------------------------------------------------------------------------------------------
// Report schema, written from the spec's "Report" section so the tests do not depend on how the tool exports its own.
// ---------------------------------------------------------------------------------------------------------------

const SourceName = z.enum(["manual", "openlibrary", "google-books", "wikimedia-commons"]);
const OutcomeName = z.enum([
  "used",
  "no-match",
  "no-cover",
  "bad-ratio",
  "too-small",
  "not-an-image",
  "http-error",
  "rate-limited",
  "skipped-no-key",
  "source-disabled",
  "budget-exhausted",
]);
const SizeSchema = z.object({ width: z.number().int().positive(), height: z.number().int().positive() });

export const ReportSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  interrupted: z.boolean(),
  books: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      author: z.string(),
      isbn: z.string().nullable(),
      status: z.enum(["ok", "skipped", "missing", "failed"]),
      file: z.string().nullable(),
      source: SourceName.nullable(),
      sourceUrl: z.string().nullable(),
      rights: z.string().nullable(),
      originalSize: SizeSchema.nullable(),
      outputSize: SizeSchema.nullable(),
      cropped: z.boolean().nullable(),
      attempts: z.array(z.object({ source: SourceName, outcome: OutcomeName, detail: z.string().optional() })),
    }),
  ),
});
export type Report = z.infer<typeof ReportSchema>;
export type ReportEntry = Report["books"][number];

// ---------------------------------------------------------------------------------------------------------------
// Fixture builders for the three remote services.
// ---------------------------------------------------------------------------------------------------------------

export const olDoc = (title: string, authors: string[], coverId?: number) => ({
  key: `/works/OL${Math.abs(title.length * 7919)}W`,
  title,
  author_name: authors,
  ...(coverId === undefined ? {} : { cover_i: coverId }),
});

export const olSearch = (...docs: ReturnType<typeof olDoc>[]) => json({ numFound: docs.length, start: 0, docs });

export const isOlSearch = (url: URL) => url.hostname === "openlibrary.org" && url.pathname === "/search.json";

export const isOlCover = (url: URL, id: number) =>
  url.hostname === "covers.openlibrary.org" && url.pathname === `/b/id/${id}-L.jpg` && url.searchParams.get("default") === "false";

export const isCommonsApi = (url: URL) => url.hostname === "commons.wikimedia.org" && url.pathname === "/w/api.php";

export type CommonsFile = { name: string; url: string; mime: string; licence?: string };

/** Both the search listing and the page/imageinfo form, so either way of calling the API gets a usable reply. */
export function commonsReply(files: CommonsFile[]) {
  const pages = Object.fromEntries(
    files.map((file, i) => [
      String(1000 + i),
      {
        pageid: 1000 + i,
        ns: 6,
        title: `File:${file.name}`,
        imageinfo: [
          {
            url: file.url,
            mime: file.mime,
            extmetadata: file.licence === undefined ? {} : { LicenseShortName: { value: file.licence } },
          },
        ],
      },
    ]),
  );
  const search = files.map((file, i) => ({ ns: 6, title: `File:${file.name}`, pageid: 1000 + i }));
  return json({ batchcomplete: "", query: { search, pages } });
}

export const googleVolume = (id: string, title: string, authors: string[], imageLinks?: Record<string, string>) => ({
  id,
  volumeInfo: { title, authors, ...(imageLinks ? { imageLinks } : {}) },
});

export const googleReply = (...items: ReturnType<typeof googleVolume>[]) => json({ kind: "books#volumes", totalItems: items.length, items });

export const isGoogleSearch = (url: URL) => url.hostname === "www.googleapis.com" && url.pathname.startsWith("/books/v1/volumes");

/** Every request made over the whole test, flagged if it used a cover endpoint that Open Library rate-limits (criterion 28). */
export const restrictedCoverCalls = (calls: Call[]) => calls.filter((call) => /^\/b\/(isbn|oclc|lccn)\//i.test(call.path));
