// Spec: docs/specs/book-content-tool.md, criteria 26-33 (online verification and its request policy).
// In-process, with a fake fetch, fake DNS and a virtual clock (tests/support/content.ts), so nothing here waits or goes online.
import { describe, expect, it } from "vitest";
import {
  callsTo,
  createNet,
  CONTACT,
  forbidRealFetch,
  htmlResponse,
  pageOf,
  redirectResponse,
  statusResponse,
  USER_AGENT,
  type Draft,
  type NetCall,
  type NetResponder,
} from "../../tests/support/content";

forbidRealFetch();

type Cite = { url: string; evidence: string };

/** A draft with one fact per citation; `sources` are exactly the cited URLs. The verifier does not need a valid draft. */
function draftCiting(slug: string, cites: Cite[]): Promise<Draft> {
  const draft: Draft = {
    version: 1,
    slug,
    title: slug,
    author: "Ann Author",
    tagline: "A tagline",
    summary: "A summary",
    about: "About text",
    whyPopular: "Why popular text",
    whyItMatters: "Why it matters text",
    authorBio: "Author bio text",
    genres: ["Fiction"],
    sources: [...new Set(cites.map((cite) => cite.url))],
    facts: cites.map((cite, i) => ({ claim: `claim ${i}`, sourceUrl: cite.url, evidence: cite.evidence })),
    confidence: "high",
    needsReview: [],
    drafter: "Claude (test fixture)",
  };
  return Promise.resolve(draft);
}

async function run(net: ReturnType<typeof createNet>, drafts: Draft[], contact = CONTACT) {
  const { verifyDrafts } = await import("./verify");
  return verifyDrafts({ drafts, contact, deps: net.deps });
}

const resultsOf = (results: Awaited<ReturnType<typeof run>>, slug: string) => results.find((entry) => entry.slug === slug)?.facts.map((fact) => fact.result);

const EVIDENCE = "It sold 1.8 million copies in the US";
const GOOD = "https://good.example.com/ok";

/** Serves the given pages (by exact URL) and 404 for everything else. */
const serve =
  (pages: Record<string, () => Response>): NetResponder =>
  (url) =>
    pages[url.href]?.();

const goodPage = () => htmlResponse(pageOf(EVIDENCE));

const gaps = (calls: NetCall[]) => calls.slice(1).map((call, i) => call.at - calls[i].at);

describe("#26 evidence that is on the page is verified", () => {
  it.each([
    ["exact text", EVIDENCE, EVIDENCE],
    ["different case", "IT sold 1.8 MILLION copies in the us", EVIDENCE],
    ["diacritics", "Théo of Golden was written in Zürich", "Theo of Golden was written in Zurich"],
    ["curly versus straight quotes", "It\u2019s a \u201cquiet\u201d book", 'It\'s a "quiet" book'],
    ["runs of whitespace", "It   sold\n\n1.8\tmillion   copies", "It sold 1.8 million copies"],
    ["text split across tags", "It sold <b>1.8</b> <i>million</i> copies", "It sold 1.8 million copies"],
    ["entities", "Tom &amp; Jerry &quot;sold&quot; well", 'Tom & Jerry "sold" well'],
  ])("%s", async (_label, pageText, evidence) => {
    const net = createNet(serve({ [GOOD]: () => htmlResponse(pageOf(pageText)) }));
    const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence }])]);
    expect(resultsOf(results, "a-book")).toEqual(["verified"]);
  });

  it.each(["text/plain", "application/xhtml+xml"])("accepts the content type %s", async (type) => {
    const net = createNet(serve({ [GOOD]: () => htmlResponse(EVIDENCE, type) }));
    const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
    expect(resultsOf(results, "a-book")).toEqual(["verified"]);
  });
});

describe("#27 evidence that is not on the page is not-found", () => {
  it("is not-found when the page says something else", async () => {
    const net = createNet(serve({ [GOOD]: () => htmlResponse(pageOf("A page about something else entirely.")) }));
    const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
    expect(resultsOf(results, "a-book")).toEqual(["not-found"]);
  });

  it("does not count text inside script and style elements", async () => {
    const html = `<html><head><style>/* ${EVIDENCE} */</style></head><body><p>Nothing here.</p><script>var s = "${EVIDENCE}";</script></body></html>`;
    const net = createNet(serve({ [GOOD]: () => htmlResponse(html) }));
    const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
    expect(resultsOf(results, "a-book")).toEqual(["not-found"]);
  });
});

describe("#28 pages that cannot be read are unreachable, and the run goes on", () => {
  const BAD = "https://bad.example.net/page";

  const CASES: [string, NetResponder][] = [
    ["HTTP 404", (url) => (url.href === BAD ? statusResponse(404) : goodPage())],
    ["HTTP 503 after the retries", (url) => (url.href === BAD ? statusResponse(503) : goodPage())],
    [
      "a timeout",
      (url) => {
        if (url.href === BAD) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
        return goodPage();
      },
    ],
    [
      "a network error",
      (url) => {
        if (url.href === BAD) throw new TypeError("fetch failed");
        return goodPage();
      },
    ],
    ["a PDF", (url) => (url.href === BAD ? htmlResponse(EVIDENCE, "application/pdf") : goodPage())],
    ["an image", (url) => (url.href === BAD ? new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }) : goodPage())],
    // The evidence is at the start, so only a size limit (not a missing text) can make this page unreachable.
    ["a body over 2 MB", (url) => (url.href === BAD ? htmlResponse(pageOf(EVIDENCE) + "x".repeat(3_000_000)) : goodPage())],
  ];

  it.each(CASES)("%s", async (_label, responder) => {
    const net = createNet(responder);
    const draft = await draftCiting("a-book", [
      { url: BAD, evidence: EVIDENCE },
      { url: GOOD, evidence: EVIDENCE },
    ]);
    const results = await run(net, [draft]);
    expect(resultsOf(results, "a-book")).toEqual(["unreachable", "verified"]);
  });
});

describe("#29 each distinct URL is fetched once per run", () => {
  it("however many facts cite it, and across drafts", async () => {
    const A = "https://a.example.com/page";
    const B = "https://b.example.org/page";
    const net = createNet(serve({ [A]: goodPage, [B]: goodPage }));
    const first = await draftCiting("first-book", [
      { url: A, evidence: EVIDENCE },
      { url: A, evidence: "It sold 1.8 million" },
      { url: B, evidence: EVIDENCE },
    ]);
    const second = await draftCiting("second-book", [{ url: A, evidence: EVIDENCE }]);
    const results = await run(net, [first, second]);

    expect(callsTo(net.calls, "a.example.com")).toHaveLength(1);
    expect(callsTo(net.calls, "b.example.org")).toHaveLength(1);
    expect(resultsOf(results, "first-book")).toEqual(["verified", "verified", "verified"]);
    expect(resultsOf(results, "second-book")).toEqual(["verified"]);
  });
});

describe("#30 request policy: spacing, one at a time, retries", () => {
  it("keeps requests to one host at least 1000 ms apart and never overlaps two requests", async () => {
    const urls = ["https://same.example.com/a", "https://same.example.com/b", "https://same.example.com/c", "https://other.example.org/a"];
    const net = createNet(() => goodPage());
    await run(net, [await draftCiting("a-book", urls.map((url) => ({ url, evidence: EVIDENCE })))]);

    expect(net.calls).toHaveLength(4);
    expect(net.peakInFlight()).toBe(1);
    for (const gap of gaps(callsTo(net.calls, "same.example.com"))) expect(gap).toBeGreaterThanOrEqual(1000);
  });

  it.each([429, 500, 502, 503, 504])("retries HTTP %i twice (3 requests), 2 s then 4 s apart", async (code) => {
    const net = createNet(() => statusResponse(code));
    const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
    expect(resultsOf(results, "a-book")).toEqual(["unreachable"]);
    expect(net.calls).toHaveLength(3);
    const [first, second] = gaps(net.calls);
    expect(first).toBeGreaterThanOrEqual(2000);
    expect(second).toBeGreaterThanOrEqual(4000);
  });

  it("verifies a page that answers after two failures", async () => {
    const net = createNet((_url, _call, index) => (index < 2 ? statusResponse(429) : goodPage()));
    const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
    expect(net.calls).toHaveLength(3);
    expect(resultsOf(results, "a-book")).toEqual(["verified"]);
  });

  it("retries a network error and a timeout twice", async () => {
    for (const error of [new TypeError("fetch failed"), new DOMException("timeout", "TimeoutError")]) {
      const net = createNet(() => {
        throw error;
      });
      const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
      expect(resultsOf(results, "a-book")).toEqual(["unreachable"]);
      expect(net.calls).toHaveLength(3);
    }
  });

  it("waits for Retry-After when it is at most 60 s", async () => {
    const net = createNet((_url, _call, index) => (index === 0 ? statusResponse(429, { "retry-after": "7" }) : goodPage()));
    const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
    expect(net.calls).toHaveLength(2);
    expect(gaps(net.calls)[0]).toBeGreaterThanOrEqual(7000);
    expect(resultsOf(results, "a-book")).toEqual(["verified"]);
  });

  it("does not wait for a Retry-After over 60 s: it falls back to the 2 s step", async () => {
    const net = createNet((_url, _call, index) => (index === 0 ? statusResponse(429, { "retry-after": "120" }) : goodPage()));
    await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
    expect(net.calls).toHaveLength(2);
    const [gap] = gaps(net.calls);
    expect(gap).toBeGreaterThanOrEqual(2000);
    expect(gap).toBeLessThan(60_000);
  });

  it.each([400, 403, 404, 410])("does not retry HTTP %i", async (code) => {
    const net = createNet(() => statusResponse(code));
    const results = await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])]);
    expect(net.calls).toHaveLength(1);
    expect(resultsOf(results, "a-book")).toEqual(["unreachable"]);
  });
});

describe("#31 at most 200 distinct URLs per run", () => {
  it("does not fetch the 201st, and marks its facts unreachable", async () => {
    const drafts: Draft[] = [];
    for (let d = 0; d < 26; d += 1) {
      const cites = Array.from({ length: 8 }, (_, j) => ({ url: `https://site${j}.example.com/d${d}/p`, evidence: EVIDENCE }));
      drafts.push(await draftCiting(`book-${d}`, cites));
    }
    const net = createNet(() => goodPage());
    const results = await run(net, drafts);

    expect(net.calls).toHaveLength(200);
    // 25 drafts x 8 = 200 URLs; the 26th draft holds URLs 201-208.
    for (let d = 0; d < 25; d += 1) expect(resultsOf(results, `book-${d}`), `book-${d}`).toEqual(Array(8).fill("verified"));
    expect(resultsOf(results, "book-25")).toEqual(Array(8).fill("unreachable"));
  });
});

describe("#32 refused URLs are blocked-url and never fetched", () => {
  const RESOLVES: Record<string, string[]> = {
    "ten.example.com": ["10.0.0.5"],
    "lan.example.com": ["192.168.1.1"],
    "meta.example.com": ["169.254.169.254"],
    "cgnat.example.com": ["100.64.0.1"],
    "ula.example.com": ["fc00::1"],
    "linklocal.example.com": ["fe80::1"],
    "mixed.example.com": ["93.184.216.34", "10.0.0.5"],
  };

  const BLOCKED = [
    "http://plain.example.com/a",
    "https://port.example.com:8443/a",
    "https://user:pw@cred.example.com/a",
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "https://ten.example.com/a",
    "https://lan.example.com/a",
    "https://meta.example.com/a",
    "https://cgnat.example.com/a",
    "https://ula.example.com/a",
    "https://linklocal.example.com/a",
    "https://mixed.example.com/a",
  ];

  it.each(BLOCKED)("%s", async (url) => {
    const net = createNet(serve({ [GOOD]: goodPage }), RESOLVES);
    const results = await run(net, [await draftCiting("a-book", [{ url, evidence: EVIDENCE }, { url: GOOD, evidence: EVIDENCE }])]);
    expect(resultsOf(results, "a-book")).toEqual(["blocked-url", "verified"]);
    const blockedHost = new URL(url).host;
    expect(net.calls.filter((call) => call.host === blockedHost)).toEqual([]);
  });

  it.each(BLOCKED)("a redirect to %s", async (target) => {
    const START = "https://hop.example.com/start";
    const net = createNet((url) => (url.href === START ? redirectResponse(target) : goodPage()), RESOLVES);
    const results = await run(net, [await draftCiting("a-book", [{ url: START, evidence: EVIDENCE }])]);
    expect(resultsOf(results, "a-book")).toEqual(["blocked-url"]);
    expect(net.calls.filter((call) => call.host === new URL(target).host)).toEqual([]);
  });

  it("follows 3 redirects but not 4", async () => {
    const chain = (length: number): NetResponder => (url) => {
      const step = Number(url.pathname.replace("/r", ""));
      return step < length ? redirectResponse(`https://hop.example.com/r${step + 1}`) : goodPage();
    };

    const three = createNet(chain(3));
    const ok = await run(three, [await draftCiting("a-book", [{ url: "https://hop.example.com/r0", evidence: EVIDENCE }])]);
    expect(resultsOf(ok, "a-book")).toEqual(["verified"]);

    const four = createNet(chain(4));
    const refused = await run(four, [await draftCiting("a-book", [{ url: "https://hop.example.com/r0", evidence: EVIDENCE }])]);
    expect(resultsOf(refused, "a-book")).toEqual(["blocked-url"]);
    expect(four.calls.some((call) => call.path === "/r4")).toBe(false);
  });
});

describe("#33 every request identifies the tool", () => {
  it("sends the User-Agent with the contact, GET, no cookies and no credentials, on every hop", async () => {
    const START = "https://hop.example.com/start";
    const net = createNet((url) => {
      if (url.href === START) return redirectResponse(GOOD);
      return goodPage();
    });
    await run(net, [await draftCiting("a-book", [{ url: START, evidence: EVIDENCE }, { url: "https://another.example.org/p", evidence: EVIDENCE }])]);

    expect(net.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of net.calls) {
      expect(call.headers.get("user-agent"), call.url).toBe(USER_AGENT);
      expect(call.method, call.url).toBe("GET");
      expect(call.headers.get("cookie"), call.url).toBeNull();
      expect(call.headers.get("authorization"), call.url).toBeNull();
    }
  });

  it("puts the given contact in the User-Agent", async () => {
    const net = createNet(() => goodPage());
    await run(net, [await draftCiting("a-book", [{ url: GOOD, evidence: EVIDENCE }])], "someone@example.net");
    expect(net.calls[0].headers.get("user-agent")).toBe("TreeOfBooksContentTool/1.0 (someone@example.net)");
  });
});
