// The one place every request goes through (docs/specs/book-cover-fetcher.md, "Request policy").
// It takes fetch, sleep and a clock, so tests need no network and no real waiting. It never throws.
import { Buffer } from "node:buffer";

export const USER_AGENT_PRODUCT = "tree-of-books-covers/1.0";
export const MAX_BODY_BYTES = 15 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const REQUEST_TIMEOUT_MS = 20_000;
export const HOST_SPACING_MS = 1000;
export const RETRY_WAITS_MS = [2000, 4000, 8000] as const;
export const MAX_RETRY_AFTER_MS = 60_000;

const EXACT_HOSTS = new Set([
  "openlibrary.org",
  "covers.openlibrary.org",
  "archive.org",
  "www.googleapis.com",
  "books.google.com",
  "commons.wikimedia.org",
  "upload.wikimedia.org",
]);
const HOST_SUFFIXES = [".archive.org", ".googleusercontent.com"];

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** The requests one book may still make. Retries count, redirect hops do not. */
export type Budget = { remaining: number };

export type HttpFailure = {
  ok: false;
  outcome: "http-error" | "rate-limited" | "not-an-image" | "budget-exhausted";
  status?: number;
  /** Short and safe: never a URL, a key or the contact address. */
  detail: string;
  /** True when this counts toward switching the source off: out of retries, or a 403. */
  breaker: boolean;
};
export type HttpSuccess = { ok: true; status: number; contentType: string | null; body: Buffer };
export type HttpResult = HttpSuccess | HttpFailure;

export type HttpOptions = {
  contact: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type GetOptions = { kind: "json" | "image"; budget?: Budget };

const fail = (outcome: HttpFailure["outcome"], detail: string, extra: { status?: number; breaker?: boolean } = {}): HttpFailure => ({
  ok: false,
  outcome,
  detail,
  status: extra.status,
  breaker: extra.breaker ?? false,
});

/** Parses and checks a URL against the rules. Returns the URL, or the reason it is refused (never the URL itself). */
export function checkUrl(raw: string): { url: URL } | { refused: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { refused: "not a valid URL" };
  }
  if (url.protocol !== "https:") return { refused: `scheme ${url.protocol} is not allowed` };
  if (url.username !== "" || url.password !== "") return { refused: "URLs with credentials are not allowed" };
  if (url.port !== "") return { refused: "ports are not allowed" };
  const host = url.hostname.toLowerCase();
  if (!EXACT_HOSTS.has(host) && !HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { refused: `host ${host} is not on the allowed list` };
  }
  return { url };
}

/** Seconds or an HTTP date, as milliseconds from now. Null when the header is missing or unreadable. */
function retryAfterMs(header: string | null, now: number): number | null {
  if (header === null) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

type Attempt =
  | { kind: "response"; response: Response }
  | { kind: "gave-up"; failure: HttpFailure };

export function createHttp(options: HttpOptions) {
  const userAgent = `${USER_AGENT_PRODUCT} (${options.contact})`;
  const fetchFn: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const lastRequestEnded = new Map<string, number>();

  async function waitForHost(host: string): Promise<void> {
    const last = lastRequestEnded.get(host);
    if (last === undefined) return;
    const wait = last + HOST_SPACING_MS - now();
    if (wait > 0) await sleep(wait);
  }

  /** One URL, with retries. Returns the response to look at, or the failure to report. */
  async function requestWithRetries(url: URL, budget: Budget | undefined, countFirstAttempt: boolean): Promise<Attempt> {
    for (let attempt = 0; ; attempt++) {
      if (budget && (attempt > 0 || countFirstAttempt)) {
        if (budget.remaining <= 0) return { kind: "gave-up", failure: fail("budget-exhausted", "the request budget for this book is used up") };
        budget.remaining--;
      }

      await waitForHost(url.hostname);
      let response: Response | null = null;
      let networkProblem: string | null = null;
      try {
        response = await fetchFn(url.href, {
          method: "GET",
          redirect: "manual",
          headers: { "user-agent": userAgent, accept: "application/json, image/*;q=0.9" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        networkProblem = name === "TimeoutError" || name === "AbortError" ? "the request timed out" : "network error";
      }
      lastRequestEnded.set(url.hostname, now());

      const status = response?.status;
      const retryable = response === null || (status !== undefined && RETRYABLE_STATUSES.has(status));
      if (!retryable) return { kind: "response", response: response as Response };

      const header = response?.headers.get("retry-after") ?? null;
      await response?.body?.cancel().catch(() => undefined);

      const asked = retryAfterMs(header, now());
      if (asked !== null && asked > MAX_RETRY_AFTER_MS) {
        return { kind: "gave-up", failure: fail("rate-limited", "the service asked for a long wait", { status, breaker: true }) };
      }
      if (attempt >= RETRY_WAITS_MS.length) {
        const detail = networkProblem ?? `HTTP ${status} after ${RETRY_WAITS_MS.length} retries`;
        return { kind: "gave-up", failure: fail(status === 429 ? "rate-limited" : "http-error", detail, { status, breaker: true }) };
      }
      await sleep(Math.max(RETRY_WAITS_MS[attempt], asked ?? 0));
    }
  }

  async function readBody(response: Response): Promise<Buffer | null> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(value);
      }
    } catch {
      return null;
    }
    return Buffer.concat(chunks);
  }

  async function get(rawUrl: string, getOptions: GetOptions): Promise<HttpResult> {
    let target = rawUrl;
    for (let hops = 0; ; hops++) {
      const checked = checkUrl(target);
      if ("refused" in checked) return fail("http-error", `refused: ${checked.refused}`);

      const attempt = await requestWithRetries(checked.url, getOptions.budget, hops === 0);
      if (attempt.kind === "gave-up") return attempt.failure;
      const { response } = attempt;
      const status = response.status;

      if (REDIRECT_STATUSES.has(status)) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (!location) return fail("http-error", "a redirect without a location", { status });
        if (hops >= MAX_REDIRECTS) return fail("http-error", `more than ${MAX_REDIRECTS} redirects`, { status });
        try {
          target = new URL(location, checked.url).href;
        } catch {
          return fail("http-error", "a redirect to an invalid URL", { status });
        }
        continue;
      }

      if (status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        return fail(status === 403 || status === 429 ? "rate-limited" : "http-error", `HTTP ${status}`, { status, breaker: status === 403 });
      }

      const contentType = response.headers.get("content-type");
      if (getOptions.kind === "image" && !(contentType ?? "").toLowerCase().startsWith("image/")) {
        await response.body?.cancel().catch(() => undefined);
        return fail("not-an-image", "the response is not an image", { status });
      }
      const body = await readBody(response);
      lastRequestEnded.set(checked.url.hostname, now());
      if (body === null) return fail(getOptions.kind === "image" ? "not-an-image" : "http-error", "the response is too large or could not be read", { status });
      return { ok: true, status, contentType, body };
    }
  }

  return { get };
}

export type Http = ReturnType<typeof createHttp>;
