// Spec: docs/specs/book-cover-fetcher.md, criteria 19–24 and the http half of 27 (request policy).
// See tests/support/covers.ts for the assumed createHttp signature. Time is a virtual clock: nothing really waits.
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  CONTACT,
  createFakeNet,
  failure,
  forbidRealFetch,
  imageResponse,
  json,
  redirectTo,
  USER_AGENT,
  type Responder,
} from "../../tests/support/covers";

forbidRealFetch();

async function makeHttp(respond: Responder) {
  const net = createFakeNet(respond);
  const { createHttp } = await import("./http");
  const http = createHttp({ contact: CONTACT, ...net.deps });
  return { http, net };
}

const OL = "https://openlibrary.org/search.json?q=x";
const gaps = (times: number[]) => times.slice(1).map((time, i) => time - times[i]);

describe("#19 User-Agent", () => {
  it("is sent on every request, including the retries and the redirect hops", async () => {
    let n = 0;
    const { http, net } = await makeHttp(() => {
      n++;
      if (n === 1) return failure(503);
      if (n === 2) return redirectTo("https://covers.openlibrary.org/b/id/1-L.jpg?default=false");
      return json({});
    });
    await http.get(OL, { kind: "json" });
    expect(net.calls.length).toBe(3);
    for (const call of net.calls) expect(call.headers.get("user-agent")).toBe(USER_AGENT);
  });
});

describe("#20 spacing between requests", () => {
  it("keeps at least 1000 ms between two requests to the same host", async () => {
    const { http, net } = await makeHttp(() => json({}));
    for (let i = 0; i < 4; i++) await http.get(`https://openlibrary.org/search.json?q=${i}`, { kind: "json" });
    expect(net.calls).toHaveLength(4);
    for (const gap of gaps(net.calls.map((c) => c.at))) expect(gap).toBeGreaterThanOrEqual(1000);
  });

  it("does not make two different hosts wait for each other", async () => {
    const { http, net } = await makeHttp(() => json({}));
    await http.get("https://openlibrary.org/search.json?q=1", { kind: "json" });
    await http.get("https://commons.wikimedia.org/w/api.php?action=query", { kind: "json" });
    await http.get("https://www.googleapis.com/books/v1/volumes?q=1", { kind: "json" });
    expect(net.sleeps.reduce((a, b) => a + b, 0)).toBe(0);
    expect(net.calls[2].at - net.calls[0].at).toBeLessThan(1000);
  });

  it("only counts the wait against the host that was used", async () => {
    const { http, net } = await makeHttp(() => json({}));
    await http.get("https://openlibrary.org/search.json?q=1", { kind: "json" });
    await http.get("https://commons.wikimedia.org/w/api.php?q=1", { kind: "json" });
    await http.get("https://openlibrary.org/search.json?q=2", { kind: "json" });
    expect(net.calls[2].at - net.calls[0].at).toBeGreaterThanOrEqual(1000);
    expect(net.calls[1].at - net.calls[0].at).toBeLessThan(1000);
  });
});

describe("#21 rate limits (429)", () => {
  it("retries after 2 s, 4 s and 8 s and succeeds on the last try", async () => {
    const { http, net } = await makeHttp((_url, _call, i) => (i < 3 ? failure(429) : json({ done: true })));
    const result = await http.get(OL, { kind: "json" });
    expect(result.ok).toBe(true);
    expect(net.calls).toHaveLength(4);
    const [a, b, c] = gaps(net.calls.map((call) => call.at));
    expect(a).toBeGreaterThanOrEqual(2000);
    expect(b).toBeGreaterThanOrEqual(4000);
    expect(c).toBeGreaterThanOrEqual(8000);
  });

  it("gives rate-limited after 3 retries (4 requests in all) and then stops", async () => {
    const { http, net } = await makeHttp(() => failure(429));
    const result = await http.get(OL, { kind: "json" });
    expect(result).toMatchObject({ ok: false, outcome: "rate-limited" });
    expect(net.calls).toHaveLength(4);
  });

  it("waits at least Retry-After seconds when that is longer than the normal wait", async () => {
    const { http, net } = await makeHttp((_url, _call, i) => (i === 0 ? failure(429, { "retry-after": "5" }) : json({})));
    const result = await http.get(OL, { kind: "json" });
    expect(result.ok).toBe(true);
    expect(net.calls[1].at - net.calls[0].at).toBeGreaterThanOrEqual(5000);
  });

  it("keeps the normal wait when Retry-After is shorter", async () => {
    const { http, net } = await makeHttp((_url, _call, i) => (i === 0 ? failure(429, { "retry-after": "1" }) : json({})));
    await http.get(OL, { kind: "json" });
    expect(net.calls[1].at - net.calls[0].at).toBeGreaterThanOrEqual(2000);
  });

  it("understands a Retry-After given as a date", async () => {
    const { http, net } = await makeHttp((_url, call, i) =>
      i === 0 ? failure(429, { "retry-after": new Date(call.at + 10_000).toUTCString() }) : json({}),
    );
    const result = await http.get(OL, { kind: "json" });
    expect(result.ok).toBe(true);
    // HTTP dates have whole-second precision, so allow one second of rounding
    expect(net.calls[1].at - net.calls[0].at).toBeGreaterThanOrEqual(9000);
  });

  it("makes no retry and gives rate-limited when Retry-After asks for more than 60 s", async () => {
    const { http, net } = await makeHttp(() => failure(429, { "retry-after": "120" }));
    const result = await http.get(OL, { kind: "json" });
    expect(result).toMatchObject({ ok: false, outcome: "rate-limited" });
    expect(net.calls).toHaveLength(1);
  });

  it("accepts Retry-After of exactly 60 s as a wait", async () => {
    const { http, net } = await makeHttp((_url, _call, i) => (i === 0 ? failure(429, { "retry-after": "60" }) : json({})));
    const result = await http.get(OL, { kind: "json" });
    expect(result.ok).toBe(true);
    expect(net.calls[1].at - net.calls[0].at).toBeGreaterThanOrEqual(60_000);
  });
});

describe("#22 other failures", () => {
  it.each([502, 503, 504])("retries a %i the same way (2 s, 4 s, 8 s) and gives up after 3 retries", async (code) => {
    const { http, net } = await makeHttp(() => failure(code));
    const result = await http.get(OL, { kind: "json" });
    expect(result.ok).toBe(false);
    expect(net.calls).toHaveLength(4);
    const [a, b, c] = gaps(net.calls.map((call) => call.at));
    expect([a >= 2000, b >= 4000, c >= 8000]).toEqual([true, true, true]);
  });

  it.each([502, 503, 504])("succeeds when a %i is followed by a good answer", async (code) => {
    const { http, net } = await makeHttp((_url, _call, i) => (i < 2 ? failure(code) : json({ ok: 1 })));
    expect((await http.get(OL, { kind: "json" })).ok).toBe(true);
    expect(net.calls).toHaveLength(3);
  });

  it("retries a network error", async () => {
    const { http, net } = await makeHttp((_url, _call, i) => {
      if (i < 2) throw new TypeError("fetch failed");
      return json({});
    });
    expect((await http.get(OL, { kind: "json" })).ok).toBe(true);
    expect(net.calls).toHaveLength(3);
  });

  it("retries a timeout", async () => {
    const { http, net } = await makeHttp((_url, _call, i) => {
      if (i < 1) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return json({});
    });
    expect((await http.get(OL, { kind: "json" })).ok).toBe(true);
    expect(net.calls).toHaveLength(2);
  });

  it("returns a failure instead of throwing when the network is down for good", async () => {
    const { http, net } = await makeHttp(() => {
      throw new TypeError("fetch failed");
    });
    const result = await http.get(OL, { kind: "json" });
    expect(result.ok).toBe(false);
    expect(net.calls).toHaveLength(4);
  });

  it.each([400, 401, 403, 404, 410, 418])("does not retry a %i", async (code) => {
    const { http, net } = await makeHttp(() => failure(code));
    const result = await http.get(OL, { kind: "json" });
    expect(result).toMatchObject({ ok: false, status: code });
    expect(net.calls).toHaveLength(1);
  });
});

describe("#23 URLs that are refused without a request", () => {
  const refused: [string, string][] = [
    ["an http: URL", "http://openlibrary.org/search.json?q=x"],
    ["a host that is not on the list", "https://example.com/cover.jpg"],
    ["a lookalike prefix host", "https://evilopenlibrary.org/cover.jpg"],
    ["an allowed name as a subdomain of another host", "https://openlibrary.org.evil.example/cover.jpg"],
    ["an archive.org lookalike", "https://notarchive.org/cover.jpg"],
    ["a googleusercontent lookalike", "https://googleusercontent.com.evil.example/cover.jpg"],
    ["an IPv4 address", "https://93.184.216.34/cover.jpg"],
    ["the loopback IPv4 address", "https://127.0.0.1/cover.jpg"],
    ["an IPv6 address", "https://[::1]/cover.jpg"],
    ["localhost", "https://localhost/cover.jpg"],
    ["a file: URL", "file:///C:/Windows/win.ini"],
    ["a data: URL", "data:image/png;base64,AAAA"],
    ["a URL with credentials", "https://user:pass@openlibrary.org/search.json?q=x"],
    ["a URL with a user name only", "https://user@openlibrary.org/search.json?q=x"],
    ["text that is not a URL", "not a url"],
  ];

  it.each(refused)("refuses %s", async (_label, url) => {
    const { http, net } = await makeHttp(() => json({}));
    const result = await http.get(url, { kind: "json" });
    expect(result.ok).toBe(false);
    expect(net.calls).toHaveLength(0);
  });

  it.each([
    "https://openlibrary.org/search.json?q=x",
    "https://covers.openlibrary.org/b/id/1-L.jpg?default=false",
    "https://archive.org/download/cover.jpg",
    "https://ia800000.us.archive.org/cover.jpg",
    "https://www.googleapis.com/books/v1/volumes?q=x",
    "https://books.google.com/books/content?id=1",
    "https://lh3.googleusercontent.com/abc",
    "https://commons.wikimedia.org/w/api.php?action=query",
    "https://upload.wikimedia.org/wikipedia/commons/a/a1/Cover.jpg",
  ])("allows %s", async (url) => {
    const { http, net } = await makeHttp(() => json({}));
    expect((await http.get(url, { kind: "json" })).ok).toBe(true);
    expect(net.calls).toHaveLength(1);
  });

  it.each([
    ["an http: URL", "http://openlibrary.org/x"],
    ["another host", "https://example.com/x"],
    ["an IP address", "https://10.0.0.1/x"],
    ["localhost", "https://localhost:3000/x"],
    ["a URL with credentials", "https://a:b@openlibrary.org/x"],
    ["a file: URL", "file:///etc/passwd"],
  ])("refuses a redirect to %s and does not request it", async (_label, target) => {
    const { http, net } = await makeHttp(() => redirectTo(target));
    const result = await http.get("https://openlibrary.org/start", { kind: "json" });
    expect(result.ok).toBe(false);
    expect(net.calls).toHaveLength(1);
  });

  it("follows redirects by hand: fetch is always told not to follow them", async () => {
    let n = 0;
    const { http, net } = await makeHttp(() =>
      n++ < 2 ? redirectTo(`https://openlibrary.org/hop${n}`) : json({ done: true }),
    );
    const result = await http.get("https://openlibrary.org/start", { kind: "json" });
    expect(result.ok).toBe(true);
    expect(net.calls).toHaveLength(3);
    for (const call of net.calls) expect(call.redirect).toBe("manual");
  });

  it("follows 5 redirects and refuses the sixth", async () => {
    const chain = (hops: number): Responder => (_url, _call, i) => (i < hops ? redirectTo(`https://openlibrary.org/hop${i + 1}`) : json({ done: true }));

    const five = await makeHttp(chain(5));
    expect((await five.http.get("https://openlibrary.org/start", { kind: "json" })).ok).toBe(true);
    expect(five.net.calls).toHaveLength(6);

    const six = await makeHttp(chain(6));
    expect((await six.http.get("https://openlibrary.org/start", { kind: "json" })).ok).toBe(false);
    expect(six.net.calls).toHaveLength(6);
  });

  it("gives up on a redirect loop", async () => {
    const { http, net } = await makeHttp(() => redirectTo("https://openlibrary.org/loop"));
    expect((await http.get("https://openlibrary.org/loop", { kind: "json" })).ok).toBe(false);
    expect(net.calls.length).toBeLessThanOrEqual(6);
  });

  it("applies the same spacing to a redirect hop on the same host", async () => {
    let n = 0;
    const { http, net } = await makeHttp(() => (n++ === 0 ? redirectTo("https://openlibrary.org/next") : json({})));
    await http.get("https://openlibrary.org/start", { kind: "json" });
    expect(net.calls[1].at - net.calls[0].at).toBeGreaterThanOrEqual(1000);
  });
});

describe("#24 image responses", () => {
  const IMG = "https://covers.openlibrary.org/b/id/1-L.jpg?default=false";

  it("gives not-an-image when the Content-Type is not image/*", async () => {
    for (const type of ["text/html; charset=utf-8", "application/json", "application/octet-stream"]) {
      const { http } = await makeHttp(() => new Response("<html></html>", { status: 200, headers: { "content-type": type } }));
      expect(await http.get(IMG, { kind: "image" }), type).toMatchObject({ ok: false, outcome: "not-an-image" });
    }
  });

  it("gives not-an-image when there is no Content-Type at all", async () => {
    const { http } = await makeHttp(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    // a Response made from bytes has no content-type unless one is set
    expect(await http.get(IMG, { kind: "image" })).toMatchObject({ ok: false, outcome: "not-an-image" });
  });

  it("returns the bytes of a normal image", async () => {
    const body = Buffer.from([1, 2, 3, 4, 5]);
    const { http } = await makeHttp(() => imageResponse(body, "image/jpeg"));
    const result = await http.get(IMG, { kind: "image" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Buffer.from(result.body).equals(body)).toBe(true);
  });

  it("refuses by the Content-Length header without reading the body", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    const { http } = await makeHttp(
      () => new Response(body, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(40 * 1024 * 1024) } }),
    );
    const result = await http.get(IMG, { kind: "image" });
    expect(result.ok).toBe(false);
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("aborts a body with no Content-Length once it passes the limit, without reading it all", async () => {
    let pulled = 0;
    const chunks = 60; // 60 MiB on offer
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= chunks) return controller.close();
        pulled++;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    const { http } = await makeHttp(() => new Response(body, { status: 200, headers: { "content-type": "image/jpeg" } }));
    const result = await http.get(IMG, { kind: "image" });
    expect(result.ok).toBe(false);
    expect(pulled).toBeGreaterThanOrEqual(15);
    expect(pulled).toBeLessThan(chunks);
  });

  it("accepts a few megabytes", async () => {
    const { http } = await makeHttp(() => imageResponse(Buffer.alloc(5 * 1024 * 1024, 1)));
    expect((await http.get(IMG, { kind: "image" })).ok).toBe(true);
  });
});

describe("#27 no secrets in what the request layer returns", () => {
  it("keeps the key and the contact out of a failure, even when the network error quotes the URL and the headers", async () => {
    const { http } = await makeHttp(() => {
      throw new TypeError(`fetch failed for https://www.googleapis.com/books/v1/volumes?q=x&key=SECRET-KEY-123 with user-agent ${USER_AGENT}`);
    });
    const result = await http.get("https://www.googleapis.com/books/v1/volumes?q=x&key=SECRET-KEY-123", { kind: "json" });
    expect(result.ok).toBe(false);
    const text = JSON.stringify(result);
    expect(text).not.toContain("SECRET-KEY-123");
    expect(text).not.toContain(CONTACT);
  });

  it("keeps them out of a refusal too", async () => {
    const { http } = await makeHttp(() => json({}));
    const result = await http.get("https://example.com/x?key=SECRET-KEY-123", { kind: "json" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SECRET-KEY-123");
  });
});
