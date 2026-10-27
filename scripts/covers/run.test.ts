// Spec: docs/specs/book-cover-fetcher.md, criteria 10 and 42 (run side), 25, 26, 27, 34–40 and 43 — one whole run
// against a fake network and a temporary output folder. The assumed runCovers signature is in tests/support/covers.ts.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  commonsReply,
  failure,
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
  png,
  readable,
  USER_AGENT,
  type Call,
} from "../../tests/support/covers";
import {
  callsTo,
  CONTACT_ADDRESS,
  KEY,
  runScenario,
  registerScenarioCleanup,
  world,
  type Handler,
} from "../../tests/support/covers-run";

forbidRealFetch();
registerScenarioCleanup();

type Book = { title: string; author: string; cover: number };
const ALPHA: Book = { title: "Alpha Tales", author: "Ann Author", cover: 101 };
const BETA: Book = { title: "Beta Stories", author: "Ben Writer", cover: 102 };
const GAMMA: Book = { title: "Gamma Notes", author: "Gina Penman", cover: 103 };
const DELTA: Book = { title: "Delta Verses", author: "Dan Poet", cover: 104 };

const listOf = (...books: Book[]) => books.map((b) => `${b.title} | ${b.author}`).join("\n");
const mentions = (call: Call, book: Book) => readable(new URL(call.url)).includes(book.title) || call.path.includes(`/b/id/${book.cover}-`);

/** Open Library knows these books: the search finds the matching one and the cover id gives a good picture. */
const catalog =
  (books: Book[], picture: (book: Book) => Promise<Buffer> = goodCover): Handler =>
  async (url) => {
    if (isOlSearch(url)) {
      const query = readable(url);
      const book = books.find((b) => query.includes(b.title));
      return book ? olSearch(olDoc(book.title, [book.author], book.cover)) : olSearch();
    }
    const book = books.find((b) => isOlCover(url, b.cover));
    return book ? imageResponse(await picture(book)) : undefined;
  };

/** An image that already sits in images/ and passes the re-run test. */
const validExisting = () => png(500, 750);

const noRequestsAllowed = world(() => {
  throw new Error("no request was expected");
});

describe("#10 and #42 a bad list is refused before any request", () => {
  it.each([
    ["an empty list", ""],
    ["a missing author", "Just A Title"],
    ["a duplicate slug", "Dune | Frank Herbert\nDune! | Someone Else"],
    ["a bad ISBN", "Dune | Frank Herbert | 9780306406158"],
    ["101 books", Array.from({ length: 101 }, (_, i) => `Book Number ${i + 1} | Author`).join("\n")],
  ])("exit code 2 and zero requests for %s", async (_label, list) => {
    const run = await runScenario({ list, key: KEY, respond: noRequestsAllowed });
    expect(run.thrown).toBeNull();
    expect(run.exitCode).toBe(2);
    expect(run.calls).toEqual([]);
    expect(run.imageNames()).toEqual([]);
  });

  it("exit code 2 and zero requests for an unknown --only slug", async () => {
    const run = await runScenario({ list: listOf(ALPHA, BETA), only: "no-such-book", respond: noRequestsAllowed });
    expect(run.exitCode).toBe(2);
    expect(run.calls).toEqual([]);
  });
});

describe("#34 the order of the sources", () => {
  it("stops at the first source that gives a usable image", async () => {
    const run = await runScenario({ list: listOf(ALPHA), key: KEY, respond: world(catalog([ALPHA])) });
    const entry = run.entry("alpha-tales");
    expect(entry).toMatchObject({ status: "ok", source: "openlibrary" });
    expect(entry.attempts.at(-1)).toMatchObject({ source: "openlibrary", outcome: "used" });
    expect(entry.attempts.some((a) => a.source === "google-books" || a.source === "wikimedia-commons")).toBe(false);
    expect(callsTo(run.calls, "www.googleapis.com")).toEqual([]);
    expect(callsTo(run.calls, "commons.wikimedia.org")).toEqual([]);
  });

  it("accepts a 300×450 Open Library cover and writes it at its own size, without enlarging it", async () => {
    const small: Handler = async (url) => {
      if (isOlSearch(url)) return olSearch(olDoc("Alpha Tales", ["Ann Author"], 1));
      if (isOlCover(url, 1)) return imageResponse(await jpeg(300, 450));
      return undefined;
    };
    const run = await runScenario({ list: listOf(ALPHA), respond: world(small) });
    expect(run.entry("alpha-tales")).toMatchObject({ status: "ok", source: "openlibrary", outputSize: { width: 300, height: 450 } });
    const meta = await sharp(run.read("images/alpha-tales.png")).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 300, height: 450 });
  });

  it("records every rejected candidate in the order tried: manual, Open Library, Google Books, Commons", async () => {
    const openLibrary: Handler = async (url) => {
      if (isOlSearch(url)) return olSearch(olDoc("Alpha Tales", ["Ann Author"], 1), olDoc("Alpha Tales", ["Ann Author"], 2));
      if (isOlCover(url, 1)) return imageResponse(await jpeg(240, 360)); // too small
      if (isOlCover(url, 2)) return imageResponse(await jpeg(900, 900)); // wrong shape
      return undefined;
    };
    const google: Handler = (url) => (isGoogleSearch(url) ? googleReply(googleVolume("V1", "Alpha Tales", ["Ann Author"])) : undefined); // no image links
    const commons: Handler = async (url) => {
      if (isCommonsApi(url))
        return commonsReply([
          { name: "Alpha Tales cover.jpg", url: "https://upload.wikimedia.org/a/alpha.jpg", mime: "image/jpeg", licence: "CC BY-SA 4.0" },
        ]);
      if (url.hostname === "upload.wikimedia.org") return imageResponse(await goodCover());
      return undefined;
    };
    const run = await runScenario({
      list: listOf(ALPHA),
      key: KEY,
      manual: { "alpha-tales.jpg": await jpeg(1000, 1000) },
      respond: world(openLibrary, google, commons),
    });
    expect(run.entry("alpha-tales").attempts.map((a) => `${a.source}:${a.outcome}`)).toEqual([
      "manual:bad-ratio",
      "openlibrary:too-small",
      "openlibrary:bad-ratio",
      "google-books:no-cover",
      "wikimedia-commons:used",
    ]);
    expect(run.entry("alpha-tales")).toMatchObject({ status: "ok", source: "wikimedia-commons" });
  });
});

describe("#35 and #36 missing, failed, and a run that carries on", () => {
  it("marks a book that every source cleanly lacks as missing, without touching the others", async () => {
    const run = await runScenario({ list: listOf(ALPHA, BETA, GAMMA), respond: world(catalog([ALPHA, GAMMA])) });
    expect(run.entry("beta-stories")).toMatchObject({ status: "missing", file: null, source: null });
    expect(run.entry("alpha-tales").status).toBe("ok");
    expect(run.entry("gamma-notes").status).toBe("ok");
    expect(run.imageNames().sort()).toEqual(["alpha-tales.png", "gamma-notes.png"]);
    expect(run.exitCode).toBe(1);
  });

  it("marks a book as failed when a source errored and nothing produced an image, and does not stop the run", async () => {
    const broken: Handler = (url) => {
      if (isOlSearch(url) && readable(url).includes(DELTA.title)) return failure(500);
      if (isOlSearch(url) && readable(url).includes(BETA.title)) return json({ docs: "this is not a list" });
      return undefined;
    };
    const run = await runScenario({ list: listOf(DELTA, BETA, ALPHA), respond: world(broken, catalog([ALPHA])) });
    expect(run.thrown).toBeNull();
    expect(run.entry("delta-verses")).toMatchObject({ status: "failed", file: null });
    expect(run.entry("beta-stories")).toMatchObject({ status: "failed", file: null });
    expect(run.entry("alpha-tales").status).toBe("ok");
    expect(run.exitCode).toBe(1);
  });

  it("goes on after a network failure for one book", async () => {
    const down: Handler = (url) => {
      if (readable(url).includes(DELTA.title)) throw new TypeError("fetch failed");
      return undefined;
    };
    const run = await runScenario({ list: listOf(DELTA, ALPHA), respond: world(down, catalog([ALPHA])) });
    expect(run.entry("delta-verses").status).toBe("failed");
    expect(run.entry("alpha-tales").status).toBe("ok");
    expect(run.exitCode).toBe(1);
  });
});

describe("#37 the images folder", () => {
  it("holds only .png files, and stale .tmp files from an earlier crash are removed", async () => {
    const run = await runScenario({
      list: listOf(ALPHA, BETA),
      respond: world(catalog([ALPHA, BETA])),
      files: {
        "images/alpha-tales.png.tmp": "half written",
        "images/old-book.png.tmp": "from long ago",
      },
    });
    expect(run.exitCode).toBe(0);
    expect(run.imageNames().sort()).toEqual(["alpha-tales.png", "beta-stories.png"]);
    expect(run.allFiles().filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(run.allFiles()).toContain("report.json");
    expect(run.imageNames()).not.toContain("report.json");
  });

  it("leaves no .tmp file behind after a failed book either", async () => {
    const run = await runScenario({ list: listOf(BETA), respond: world(catalog([])) });
    expect(run.allFiles().filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(run.imageNames()).toEqual([]);
  });
});

describe("#38 re-runs", () => {
  it("skips a valid image: no request, same bytes, same modification time, and the report keeps what it knew", async () => {
    const first = await runScenario({ list: listOf(ALPHA, BETA), respond: world(catalog([ALPHA, BETA])) });
    const before = first.read("images/alpha-tales.png");
    const mtime = first.mtime("images/alpha-tales.png");
    const knew = first.entry("alpha-tales");

    const second = await runScenario({ list: listOf(ALPHA, BETA), outDir: first.outDir, respond: noRequestsAllowed });
    expect(second.calls).toEqual([]);
    expect(second.exitCode).toBe(0);
    expect(second.read("images/alpha-tales.png").equals(before)).toBe(true);
    expect(second.mtime("images/alpha-tales.png")).toBe(mtime);

    const skipped = second.entry("alpha-tales");
    expect(skipped.status).toBe("skipped");
    expect(skipped).toMatchObject({
      source: knew.source,
      sourceUrl: knew.sourceUrl,
      rights: knew.rights,
      originalSize: knew.originalSize,
      outputSize: knew.outputSize,
    });
    expect(second.entry("beta-stories").status).toBe("skipped");
  });

  it("skips an image it has no earlier report for, with null source details", async () => {
    const run = await runScenario({ list: listOf(ALPHA), images: { "alpha-tales.png": await validExisting() }, respond: noRequestsAllowed });
    expect(run.calls).toEqual([]);
    expect(run.entry("alpha-tales")).toMatchObject({ status: "skipped", source: null, sourceUrl: null, rights: null });
    expect(run.exitCode).toBe(0);
  });

  it.each([
    [250, 375],
    [300, 450],
    [400, 600],
  ])("treats an existing image of %i×%i as valid", async (width, height) => {
    const run = await runScenario({ list: listOf(ALPHA), images: { "alpha-tales.png": await png(width, height) }, respond: noRequestsAllowed });
    expect(run.calls).toEqual([]);
    expect(run.entry("alpha-tales").status).toBe("skipped");
  });

  it.each([
    ["a corrupt file", () => Promise.resolve(Buffer.from("this is not a png"))],
    ["a JPEG with a .png name", () => jpeg(650, 975)],
    ["a PNG that is not 2:3", () => png(600, 800)],
    ["a PNG under 250 px wide", () => png(240, 360)],
    ["an empty file", () => Promise.resolve(Buffer.alloc(0))],
  ])("fetches again when the existing file is %s", async (_label, make) => {
    const run = await runScenario({ list: listOf(ALPHA), images: { "alpha-tales.png": await make() }, respond: world(catalog([ALPHA])) });
    expect(run.calls.length).toBeGreaterThan(0);
    expect(run.entry("alpha-tales").status).toBe("ok");
    expect((await sharp(run.read("images/alpha-tales.png")).metadata()).format).toBe("png");
    expect((await sharp(run.read("images/alpha-tales.png")).metadata()).width).toBe(650);
  });

  it("--force fetches a book that has a valid image and replaces the file", async () => {
    const run = await runScenario({
      list: listOf(ALPHA),
      force: true,
      images: { "alpha-tales.png": await validExisting() },
      respond: world(catalog([ALPHA])),
    });
    expect(run.calls.length).toBeGreaterThan(0);
    expect(run.entry("alpha-tales").status).toBe("ok");
    const meta = await sharp(run.read("images/alpha-tales.png")).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 650, height: 975 });
  });

  it("--only touches just that book", async () => {
    const run = await runScenario({ list: listOf(ALPHA, BETA), only: "alpha-tales", respond: world(catalog([ALPHA, BETA])) });
    expect(run.exitCode).toBe(0);
    expect(run.imageNames()).toEqual(["alpha-tales.png"]);
    expect(run.calls.length).toBeGreaterThan(0);
    expect(run.calls.some((call) => mentions(call, BETA))).toBe(false);
  });
});

describe("#39 the report", () => {
  it("has one entry per list line in order, with real files, matching sizes and rights on every ok entry", async () => {
    const run = await runScenario({
      list: listOf(ALPHA, BETA, GAMMA),
      images: { "gamma-notes.png": await validExisting() },
      respond: world(catalog([ALPHA])),
    });
    const report = run.report;
    expect(report).not.toBeNull();
    expect(report?.version).toBe(1);
    expect(report?.interrupted).toBe(false);
    expect(Number.isNaN(Date.parse(report?.generatedAt ?? ""))).toBe(false);
    expect(report?.books.map((b) => b.slug)).toEqual(["alpha-tales", "beta-stories", "gamma-notes"]);
    expect(report?.books.map((b) => [b.title, b.author])).toEqual([
      ["Alpha Tales", "Ann Author"],
      ["Beta Stories", "Ben Writer"],
      ["Gamma Notes", "Gina Penman"],
    ]);

    const alpha = run.entry("alpha-tales");
    expect(alpha.status).toBe("ok");
    expect(alpha.file).toBe("images/alpha-tales.png");
    expect(alpha.rights?.length).toBeGreaterThan(0);
    expect(alpha.sourceUrl?.length).toBeGreaterThan(0);
    const meta = await sharp(run.read(alpha.file!)).metadata();
    expect(alpha.outputSize).toEqual({ width: meta.width, height: meta.height });

    expect(run.entry("beta-stories")).toMatchObject({ status: "missing", file: null });
    expect(run.entry("gamma-notes").status).toBe("skipped");
  });

  it("is rewritten on every run", async () => {
    const first = await runScenario({ list: listOf(ALPHA), respond: world(catalog([ALPHA])) });
    expect(first.entry("alpha-tales").status).toBe("ok");
    const second = await runScenario({ list: listOf(ALPHA), outDir: first.outDir, respond: noRequestsAllowed });
    expect(second.entry("alpha-tales").status).toBe("skipped");
  });
});

describe("#25 the request budget", () => {
  /** Every URL fails twice with a 503 and then answers, so each request costs 3 calls. Retries are part of the budget. */
  function flaky(inner: Handler): Handler {
    const seen = new Map<string, number>();
    return (url, call, index) => {
      const count = (seen.get(call.url) ?? 0) + 1;
      seen.set(call.url, count);
      return count <= 2 ? failure(503) : inner(url, call, index);
    };
  }

  it("stops a book after 12 requests with budget-exhausted, and the next book starts with a fresh budget", async () => {
    const wide = (url: URL) => {
      if (isOlSearch(url) && readable(url).includes("Budget One")) {
        return olSearch(...[1, 2, 3, 4, 5].map((id) => olDoc("Budget One", ["Bea Author"], 200 + id)));
      }
      return undefined;
    };
    const squares: Handler = async (url) => {
      for (const id of [201, 202, 203, 204, 205]) if (isOlCover(url, id)) return imageResponse(await jpeg(900, 900));
      return undefined;
    };
    const two: Book = { title: "Budget Two", author: "Bo Writer", cover: 9 };
    const run = await runScenario({
      list: `Budget One | Bea Author\n${listOf(two)}`,
      respond: world(flaky(world(wide, squares, catalog([two])))),
    });

    const forTwo = run.calls.filter((call) => mentions(call, two));
    const forOne = run.calls.filter((call) => !mentions(call, two));
    expect(forOne).toHaveLength(12);
    expect(run.entry("budget-one")).toMatchObject({ status: "failed", file: null });
    expect(run.entry("budget-one").attempts).toContainEqual(expect.objectContaining({ outcome: "budget-exhausted" }));
    expect(forTwo.length).toBeGreaterThan(0);
    expect(run.entry("budget-two").status).toBe("ok");
  });
});

describe("#26 the circuit breaker", () => {
  const W = { title: "Wind One", author: "Wes Author", cover: 301 };
  const X = { title: "Wind Two", author: "Xan Author", cover: 302 };
  const Y = { title: "Wind Three", author: "Yan Author", cover: 303 };
  const Z = { title: "Wind Four", author: "Zed Author", cover: 304 };
  const olCalls = (calls: Call[]) => callsTo(calls, "openlibrary.org");

  it.each([
    ["runs out of retries (503)", 503, 8],
    ["gets a 403", 403, 2],
  ])("switches Open Library off for the rest of the run when it %s twice in a row", async (_label, code, expectedCalls) => {
    const down: Handler = (url) => (isOlSearch(url) ? failure(code) : undefined);
    const run = await runScenario({ list: listOf(W, X, Y, Z), respond: world(down) });
    expect(olCalls(run.calls)).toHaveLength(expectedCalls);
    expect(run.entry("wind-one").status).toBe("failed");
    expect(run.entry("wind-two").status).toBe("failed");
    for (const slug of ["wind-three", "wind-four"]) {
      expect(run.entry(slug).attempts).toContainEqual(expect.objectContaining({ source: "openlibrary", outcome: "source-disabled" }));
    }
  });

  it("does not switch a source off when its failures are not in a row", async () => {
    const down: Handler = (url) => (isOlSearch(url) && (readable(url).includes(W.title) || readable(url).includes(Y.title)) ? failure(503) : undefined);
    const good: Book = { title: "Wind Five", author: "Vic Author", cover: 305 };
    const run = await runScenario({ list: listOf(W, good, Y, X), respond: world(down, catalog([good, X])) });
    expect(run.entry("wind-one").status).toBe("failed");
    expect(run.entry("wind-five").status).toBe("ok");
    expect(run.entry("wind-three").status).toBe("failed");
    expect(run.entry("wind-two")).toMatchObject({ status: "ok", source: "openlibrary" });
  });
});

describe("#27 secrets", () => {
  it("keeps the API key and the contact address out of the report, the console and any error, even when requests fail", async () => {
    const leaky: Handler = (url) => {
      if (readable(url).includes(ALPHA.title) && (url.hostname === "openlibrary.org" || url.hostname === "www.googleapis.com")) {
        throw new TypeError(`fetch failed: ${url.href} (user-agent: ${USER_AGENT}, key ${KEY})`);
      }
      return undefined;
    };
    const run = await runScenario({
      list: listOf(ALPHA, BETA),
      key: KEY,
      contact: CONTACT_ADDRESS,
      respond: world(leaky, catalog([BETA])),
    });
    expect(run.thrown).toBeNull();
    expect(run.entry("alpha-tales").status).toBe("failed");
    expect(run.entry("beta-stories").status).toBe("ok");
    for (const [where, text] of [
      ["the report", run.reportText ?? ""],
      ["the console", run.console],
    ] as const) {
      expect(text, where).not.toContain(KEY);
      expect(text, where).not.toContain(CONTACT_ADDRESS);
    }
    expect(run.console.length).toBeGreaterThan(0); // there was console output to look at
  });

  it("does not put the key in a source URL it records for an image that came from Google Books", async () => {
    const google: Handler = async (url) => {
      if (isGoogleSearch(url)) {
        return googleReply(googleVolume("V1", "Alpha Tales", ["Ann Author"], { thumbnail: "https://books.google.com/books/content?id=V1&img=1&edge=curl" }));
      }
      return url.hostname === "books.google.com" ? imageResponse(await goodCover()) : undefined;
    };
    const run = await runScenario({ list: listOf(ALPHA), key: KEY, respond: world(google) });
    expect(run.entry("alpha-tales")).toMatchObject({ status: "ok", source: "google-books" });
    expect(run.reportText).not.toContain(KEY);
    expect(run.console).not.toContain(KEY);
  });
});

describe("#40 stopping", () => {
  it("starts no new book once the abort signal has fired, writes the report with interrupted: true and leaves no .tmp file", async () => {
    const controller = new AbortController();
    const abortOnFirstCall: Handler = () => {
      controller.abort();
      return undefined;
    };
    const run = await runScenario({
      list: listOf(ALPHA, BETA, GAMMA),
      signal: controller.signal,
      respond: world(abortOnFirstCall, catalog([ALPHA, BETA, GAMMA])),
    });
    expect(run.report?.interrupted).toBe(true);
    expect(run.calls.some((call) => mentions(call, BETA) || mentions(call, GAMMA))).toBe(false);
    expect(run.allFiles().filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(run.imageNames().every((name) => name.endsWith(".png"))).toBe(true);
    expect(run.imageNames()).not.toContain("beta-stories.png");
    expect(run.imageNames()).not.toContain("gamma-notes.png");
  });

  it("makes no request at all when the signal has already fired", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = await runScenario({ list: listOf(ALPHA), signal: controller.signal, respond: noRequestsAllowed });
    expect(run.calls).toEqual([]);
    expect(run.report?.interrupted).toBe(true);
  });

  it("writes interrupted: false after a complete run", async () => {
    const run = await runScenario({ list: listOf(ALPHA), respond: world(catalog([ALPHA])) });
    expect(run.report?.interrupted).toBe(false);
  });
});

describe("#43 exit codes", () => {
  it("is 0 when every book is ok", async () => {
    expect((await runScenario({ list: listOf(ALPHA, BETA), respond: world(catalog([ALPHA, BETA])) })).exitCode).toBe(0);
  });

  it("is 0 when every book is skipped", async () => {
    const run = await runScenario({ list: listOf(ALPHA, BETA), images: { "alpha-tales.png": await validExisting(), "beta-stories.png": await validExisting() }, respond: noRequestsAllowed });
    expect(run.exitCode).toBe(0);
  });

  it("is 0 for a mix of ok and skipped", async () => {
    const run = await runScenario({ list: listOf(ALPHA, BETA), images: { "alpha-tales.png": await validExisting() }, respond: world(catalog([BETA])) });
    expect(run.exitCode).toBe(0);
  });

  it("is 1 when a book is missing", async () => {
    expect((await runScenario({ list: listOf(ALPHA, BETA), respond: world(catalog([ALPHA])) })).exitCode).toBe(1);
  });

  it("is 1 when a book failed", async () => {
    const run = await runScenario({ list: listOf(ALPHA), respond: world((url) => (isOlSearch(url) ? failure(500) : undefined)) });
    expect(run.exitCode).toBe(1);
  });
});
