// Spec: docs/specs/book-cover-fetcher.md, criteria 28–33 (sources), driven through `runCovers` with a fake network.
// Where the spec leaves the request shape open (how the ISBN edition is looked up on Open Library, whether Commons is
// asked for the image info in a second request), the fake replies carry every documented form at once, so any
// reasonable implementation can read them.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  commonsReply,
  forbidRealFetch,
  goodCover,
  googleReply,
  googleVolume,
  imageResponse,
  isCommonsApi,
  isGoogleSearch,
  isOlCover,
  isOlSearch,
  jpeg,
  json,
  olDoc,
  olSearch,
  readable,
  restrictedCoverCalls,
  type Call,
  type CommonsFile,
} from "../../tests/support/covers";
import { callsTo, KEY, runScenario, registerScenarioCleanup, world, type Handler } from "../../tests/support/covers-run";

forbidRealFetch();
registerScenarioCleanup();

const HOBBIT = "The Hobbit | J.R.R. Tolkien";
const OL_IMAGE = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`;

const olCoverCalls = (calls: Call[]) => calls.filter((call) => call.host === "covers.openlibrary.org");

/** Open Library: a search reply, and good or bad pictures for the cover ids. */
function openLibrary(docs: ReturnType<typeof olDoc>[], pictures: Record<number, "good" | "square">): Handler {
  return async (url) => {
    if (isOlSearch(url)) return olSearch(...docs);
    for (const [id, kind] of Object.entries(pictures)) {
      if (isOlCover(url, Number(id))) return imageResponse(kind === "good" ? await goodCover() : await jpeg(900, 900));
    }
    return undefined;
  };
}

describe("#28 Open Library without an ISBN", () => {
  it("searches by title and author with limit=5 and a restricted fields list", async () => {
    const run = await runScenario({ list: HOBBIT, respond: world(openLibrary([olDoc("The Hobbit", ["J.R.R. Tolkien"], 22)], { 22: "good" })) });
    const search = run.calls.find((call) => call.path === "/search.json");
    expect(search, "a search request").toBeDefined();
    const url = new URL(search!.url);
    expect(url.hostname).toBe("openlibrary.org");
    expect(readable(url)).toContain("The Hobbit");
    expect(readable(url)).toContain("Tolkien");
    expect(url.searchParams.get("limit")).toBe("5");
    const fields = (url.searchParams.get("fields") ?? "").split(",");
    expect(fields).toEqual(expect.arrayContaining(["key", "title", "author_name", "cover_i"]));
    expect(fields).not.toContain("*");
  });

  it("uses the first matching result that has a cover_i, by cover id, and never an ISBN cover URL", async () => {
    const docs = [
      olDoc("SparkNotes: The Hobbit", ["SparkNotes"], 11), // not the book
      olDoc("The Hobbit", ["Somebody Else"], 12), // right title, wrong author
      olDoc("The Hobbit", ["J. R. R. Tolkien"]), // the book, but no cover
      olDoc("The Hobbit", ["J. R. R. Tolkien"], 14), // first usable
      olDoc("The Hobbit", ["J. R. R. Tolkien"], 15),
    ];
    const run = await runScenario({ list: HOBBIT, respond: world(openLibrary(docs, { 11: "good", 12: "good", 14: "good", 15: "good" })) });

    expect(olCoverCalls(run.calls).map((call) => call.url)).toEqual([OL_IMAGE(14)]);
    expect(restrictedCoverCalls(run.calls)).toEqual([]);

    const entry = run.entry("the-hobbit");
    expect(entry.status).toBe("ok");
    expect(entry.source).toBe("openlibrary");
    expect(entry.sourceUrl).toContain("/b/id/14-L.jpg");
    expect(entry.file).toBe("images/the-hobbit.png");
  });

  it("records no-match and tries the next source when no result matches the book", async () => {
    const docs = [olDoc("SparkNotes: The Hobbit", ["SparkNotes"], 11), olDoc("The Hobbit", ["Somebody Else"], 12)];
    const run = await runScenario({ list: HOBBIT, respond: world(openLibrary(docs, { 11: "good", 12: "good" })) });
    expect(olCoverCalls(run.calls)).toEqual([]);
    expect(run.entry("the-hobbit").attempts).toContainEqual(expect.objectContaining({ source: "openlibrary", outcome: "no-match" }));
    expect(callsTo(run.calls, "commons.wikimedia.org").length).toBeGreaterThan(0);
  });
});

describe("#29 Open Library with an ISBN", () => {
  const LIST = "Good Omens | Neil Gaiman & Terry Pratchett | 978-0-06-085398-3";
  const DIGITS = "9780060853983";

  /** Any openlibrary.org request that names the ISBN is answered with an edition that carries every documented shape. */
  const edition = (coverIds: number[]): Handler => (url) => {
    if (url.hostname !== "openlibrary.org" || !url.href.includes(DIGITS)) return undefined;
    const doc = olDoc("Good Omens", ["Neil Gaiman", "Terry Pratchett"], coverIds[0]);
    return json({ key: "/books/OL1M", title: "Good Omens", covers: coverIds, docs: [doc], numFound: 1 });
  };

  it("looks the edition up by the digits of the ISBN and asks for the cover by id", async () => {
    const run = await runScenario({
      list: LIST,
      respond: world(edition([77]), async (url) => (isOlCover(url, 77) ? imageResponse(await goodCover()) : undefined)),
    });
    expect(run.calls.some((call) => call.host === "openlibrary.org" && call.url.includes(DIGITS))).toBe(true);
    expect(olCoverCalls(run.calls).map((call) => call.url)).toEqual([OL_IMAGE(77)]);
    expect(restrictedCoverCalls(run.calls)).toEqual([]);
    expect(run.entry("good-omens")).toMatchObject({ status: "ok", source: "openlibrary", isbn: DIGITS });
  });

  it("gives no-cover for an edition without a cover and goes on to the next source", async () => {
    const run = await runScenario({ list: LIST, key: KEY, respond: world(edition([])) });
    expect(olCoverCalls(run.calls)).toEqual([]);
    expect(restrictedCoverCalls(run.calls)).toEqual([]);
    expect(run.entry("good-omens").attempts).toContainEqual(expect.objectContaining({ source: "openlibrary", outcome: "no-cover" }));
    expect(callsTo(run.calls, "www.googleapis.com").length).toBeGreaterThan(0);
  });
});

describe("#31 Google Books", () => {
  const LINKS = (id: string, sizes: string[]) =>
    Object.fromEntries(sizes.map((size) => [size, `https://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&size=${size}&edge=curl`]));
  const volume = (id: string, sizes = ["smallThumbnail", "thumbnail"]) => googleVolume(id, "The Hobbit", ["J.R.R. Tolkien"], LINKS(id, sizes));
  const googleSearch = (...items: ReturnType<typeof googleVolume>[]): Handler => (url) => (isGoogleSearch(url) ? googleReply(...items) : undefined);
  const googleImages = (kind: "good" | "square"): Handler => async (url) =>
    url.hostname === "books.google.com" ? imageResponse(kind === "good" ? await goodCover() : await jpeg(900, 900)) : undefined;
  const googleCalls = (calls: Call[]) => calls.filter((call) => call.host === "www.googleapis.com" || call.host === "books.google.com");

  it("makes no request at all without a key and records skipped-no-key", async () => {
    const run = await runScenario({ list: HOBBIT, key: null, respond: world(googleSearch(volume("V1")), googleImages("good")) });
    expect(googleCalls(run.calls)).toEqual([]);
    expect(run.entry("the-hobbit").attempts).toContainEqual(expect.objectContaining({ source: "google-books", outcome: "skipped-no-key" }));
  });

  it("sends the key to www.googleapis.com and to no other host", async () => {
    const run = await runScenario({ list: HOBBIT, key: KEY, respond: world(googleSearch(volume("V1")), googleImages("good")) });
    const withKey = run.calls.filter((call) => decodeURIComponent(call.url).includes(KEY) || [...call.headers.values()].some((v) => v.includes(KEY)));
    expect(withKey.length).toBeGreaterThan(0);
    expect(withKey.every((call) => call.host === "www.googleapis.com")).toBe(true);
    expect(new URL(withKey[0].url).searchParams.get("key")).toBe(KEY);
    expect(run.entry("the-hobbit")).toMatchObject({ status: "ok", source: "google-books" });
    expect(JSON.stringify(run.report)).not.toContain(KEY);
  });

  it("uses the largest image link and removes the page-curl parameter", async () => {
    const all = ["smallThumbnail", "thumbnail", "small", "medium", "large", "extraLarge"];
    const run = await runScenario({ list: HOBBIT, key: KEY, respond: world(googleSearch(volume("VOL1", all)), googleImages("good")) });
    const image = run.calls.find((call) => call.host === "books.google.com");
    expect(image, "an image request").toBeDefined();
    const url = new URL(image!.url);
    expect(url.searchParams.get("size")).toBe("extraLarge");
    expect(url.searchParams.get("edge")).toBeNull();
    expect(url.searchParams.get("id")).toBe("VOL1");
    expect(url.searchParams.get("img")).toBe("1");
  });

  it("falls back to the next largest link when the largest is not offered", async () => {
    const run = await runScenario({ list: HOBBIT, key: KEY, respond: world(googleSearch(volume("VOL1", ["smallThumbnail", "thumbnail", "large"])), googleImages("good")) });
    const image = run.calls.find((call) => call.host === "books.google.com");
    expect(new URL(image!.url).searchParams.get("size")).toBe("large");
  });

  it("records no-cover for a volume without image links", async () => {
    const run = await runScenario({ list: HOBBIT, key: KEY, respond: world(googleSearch(googleVolume("V1", "The Hobbit", ["J.R.R. Tolkien"]))) });
    expect(run.entry("the-hobbit").attempts).toContainEqual(expect.objectContaining({ source: "google-books", outcome: "no-cover" }));
    expect(callsTo(run.calls, "books.google.com")).toEqual([]);
  });

  it("skips volumes that do not match the book", async () => {
    const items = [
      googleVolume("V1", "SparkNotes: The Hobbit", ["SparkNotes"], LINKS("V1", ["thumbnail"])),
      googleVolume("V2", "The Hobbit", ["Somebody Else"], LINKS("V2", ["thumbnail"])),
    ];
    const run = await runScenario({ list: HOBBIT, key: KEY, respond: world(googleSearch(...items), googleImages("good")) });
    expect(callsTo(run.calls, "books.google.com")).toEqual([]);
  });

  it("returns at most 3 candidates", async () => {
    const items = ["V1", "V2", "V3", "V4", "V5"].map((id) => volume(id));
    const run = await runScenario({ list: HOBBIT, key: KEY, respond: world(googleSearch(...items), googleImages("square")) });
    expect(callsTo(run.calls, "books.google.com")).toHaveLength(3);
    expect(run.entry("the-hobbit").attempts.filter((a) => a.source === "google-books" && a.outcome === "bad-ratio")).toHaveLength(3);
  });

  it("searches by ISBN when the list has one, and by title and author when it has not", async () => {
    const withIsbn = await runScenario({ list: "The Hobbit | J.R.R. Tolkien | 978-0-261-10235-4", key: KEY, respond: world() });
    const isbnSearch = withIsbn.calls.find((call) => call.host === "www.googleapis.com");
    expect(isbnSearch && readable(new URL(isbnSearch.url))).toContain("isbn:9780261102354");

    const without = await runScenario({ list: HOBBIT, key: KEY, respond: world() });
    const textSearch = without.calls.find((call) => call.host === "www.googleapis.com");
    const text = readable(new URL(textSearch!.url));
    expect(text).toContain("Hobbit");
    expect(text).toContain("Tolkien");
  });
});

describe("#32 Wikimedia Commons", () => {
  const file = (over: Partial<CommonsFile> = {}): CommonsFile => ({
    name: "The Hobbit first edition cover.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/The_Hobbit_first_edition_cover.jpg",
    mime: "image/jpeg",
    licence: "Public domain",
    ...over,
  });
  const commons = (...files: CommonsFile[]): Handler => (url) => (isCommonsApi(url) ? commonsReply(files) : undefined);
  const wikimediaImages = (kind: "good" | "square" = "good"): Handler => async (url) =>
    url.hostname === "upload.wikimedia.org" ? imageResponse(kind === "good" ? await goodCover() : await jpeg(900, 900)) : undefined;
  const imageCalls = (calls: Call[]) => callsTo(calls, "upload.wikimedia.org");

  it("searches the File namespace for title, author surname and the word cover, limit 5", async () => {
    const run = await runScenario({ list: HOBBIT, respond: world(commons(file()), wikimediaImages()) });
    const search = run.calls.find((call) => isCommonsApi(new URL(call.url)));
    expect(search).toBeDefined();
    const url = new URL(search!.url);
    expect(readable(url)).toContain("The Hobbit Tolkien cover");
    expect(url.search).toMatch(/namespace=6/);
    expect(url.search).toMatch(/limit=5/);
  });

  it.each(["CC0", "CC BY 4.0", "CC BY-SA 3.0", "Public domain"])("accepts the licence %j and stores its text in rights", async (licence) => {
    const run = await runScenario({ list: HOBBIT, respond: world(commons(file({ licence })), wikimediaImages()) });
    const entry = run.entry("the-hobbit");
    expect(entry).toMatchObject({ status: "ok", source: "wikimedia-commons" });
    expect(entry.rights).toContain(licence);
    expect(entry.sourceUrl).toContain("upload.wikimedia.org");
  });

  it.each([["CC BY-NC 4.0"], ["CC BY-ND 2.0"], ["Fair use"], ["All rights reserved"], [undefined]])(
    "rejects the licence %j without downloading the file",
    async (licence) => {
      const run = await runScenario({ list: HOBBIT, respond: world(commons(file({ licence })), wikimediaImages()) });
      expect(imageCalls(run.calls)).toEqual([]);
      expect(run.entry("the-hobbit")).toMatchObject({ status: "missing", file: null });
    },
  );

  it.each([
    ["TIFF", "image/tiff", "The Hobbit cover.tif"],
    ["SVG", "image/svg+xml", "The Hobbit cover.svg"],
    ["PDF", "application/pdf", "The Hobbit cover.pdf"],
  ])("rejects a %s file", async (_label, mime, name) => {
    const run = await runScenario({ list: HOBBIT, respond: world(commons(file({ mime, name })), wikimediaImages()) });
    expect(imageCalls(run.calls)).toEqual([]);
    expect(run.entry("the-hobbit").status).toBe("missing");
  });

  it.each([["image/png", "The Hobbit cover.png"], ["image/webp", "The Hobbit cover.webp"]])("accepts a %s file", async (mime, name) => {
    const run = await runScenario({ list: HOBBIT, respond: world(commons(file({ mime, name })), wikimediaImages()) });
    expect(run.entry("the-hobbit").status).toBe("ok");
  });

  it("rejects a file whose name lacks a title word or the word cover", async () => {
    const files = [
      file({ name: "Hobbit cover.jpg", url: "https://upload.wikimedia.org/a/1.jpg" }),
      file({ name: "The Hobbit illustration.jpg", url: "https://upload.wikimedia.org/a/2.jpg" }),
      file({ name: "The cover.jpg", url: "https://upload.wikimedia.org/a/3.jpg" }),
    ];
    const run = await runScenario({ list: HOBBIT, respond: world(commons(...files), wikimediaImages()) });
    expect(imageCalls(run.calls).map((call) => call.path)).not.toContain("/a/2.jpg");
    expect(imageCalls(run.calls).map((call) => call.path)).not.toContain("/a/3.jpg");
  });

  it("returns at most 3 candidates", async () => {
    const files = [1, 2, 3, 4, 5].map((n) => file({ name: `The Hobbit cover ${n}.jpg`, url: `https://upload.wikimedia.org/a/${n}.jpg` }));
    const run = await runScenario({ list: HOBBIT, respond: world(commons(...files), wikimediaImages("square")) });
    expect(imageCalls(run.calls)).toHaveLength(3);
  });
});

describe("#33 manual files", () => {
  it.each([
    ["the-hobbit.png", async () => sharp(await goodCover()).png().toBuffer()],
    ["the-hobbit.jpg", () => goodCover()],
    ["the-hobbit.jpeg", () => goodCover()],
    ["the-hobbit.webp", async () => sharp(await goodCover()).webp().toBuffer()],
  ])("uses manual/%s before any request is made", async (name, make) => {
    const run = await runScenario({ list: HOBBIT, manual: { [name]: await make() }, respond: world(openLibrary([olDoc("The Hobbit", ["J.R.R. Tolkien"], 22)], { 22: "good" })) });
    expect(run.calls).toEqual([]);
    const entry = run.entry("the-hobbit");
    expect(entry).toMatchObject({ status: "ok", source: "manual", file: "images/the-hobbit.png", rights: "Supplied by the developer." });
    expect(entry.sourceUrl).toContain(name);
    expect(run.imageNames()).toEqual(["the-hobbit.png"]);
  });

  it("records a rejected manual file and goes on to the online sources", async () => {
    const run = await runScenario({
      list: HOBBIT,
      manual: { "the-hobbit.jpg": await jpeg(1000, 1000) },
      respond: world(openLibrary([olDoc("The Hobbit", ["J.R.R. Tolkien"], 22)], { 22: "good" })),
    });
    const entry = run.entry("the-hobbit");
    expect(entry.attempts[0]).toMatchObject({ source: "manual", outcome: "bad-ratio" });
    expect(entry).toMatchObject({ status: "ok", source: "openlibrary" });
  });
});
