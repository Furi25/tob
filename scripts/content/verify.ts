// Online verification: fetch each cited page once and look for the evidence text on it
// (docs/specs/book-content-tool.md, "Online verification"). All outside access goes through `deps`, so tests run offline.
import {
  HOST_SPACING_MS,
  MAX_BODY_BYTES,
  MAX_REDIRECTS,
  MAX_RETRIES,
  MAX_RETRY_AFTER_MS,
  MAX_URLS_PER_RUN,
  REQUEST_TIMEOUT_MS,
  RETRY_BACKOFF_MS,
} from "./limits";
import { checkTarget, type Resolve } from "./net";

export type VerifyResult = "verified" | "not-found" | "unreachable" | "blocked-url";
export type VerifyDeps = {
  fetch: typeof fetch;
  resolve: Resolve;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};
export type VerifiedFact = { claim: string; sourceUrl: string; result: VerifyResult };
export type VerifiedDraft = { slug: string; facts: VerifiedFact[] };
export type DraftFacts = { slug: string; facts: { claim: string; sourceUrl: string; evidence: string }[] };

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PLAIN_TYPES = new Set(["text/plain"]);
const MARKUP_TYPES = new Set(["text/html", "application/xhtml+xml"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const BLOCK_TAGS = /<\/?(?:address|article|aside|blockquote|body|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|head|header|hr|html|li|main|nav|ol|p|section|table|td|th|tr|ul|title)\b[^>]*>/gi;

/** The visible text of an HTML page. Inline tags vanish without a gap, so a word split by markup stays one word. */
export function htmlToText(html: string): string {
  const withoutCode = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  return decodeEntities(withoutCode.replace(BLOCK_TAGS, " ").replace(/<[^>]*>/g, ""));
}

/** The form both the page and the evidence are put in before they are compared. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

type Page = { kind: "text"; text: string } | { kind: "unreachable" } | { kind: "blocked-url" };

function retryAfterMs(response: Response, now: number): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) return null;
  let ms: number;
  if (/^\d+$/.test(header.trim())) {
    ms = Number(header.trim()) * 1000;
  } else {
    const date = Date.parse(header);
    if (Number.isNaN(date)) return null;
    ms = Math.max(0, date - now);
  }
  return ms <= MAX_RETRY_AFTER_MS ? ms : null;
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing to release.
  }
}

async function readText(response: Response): Promise<string | null> {
  const [type, ...parameters] = (response.headers.get("content-type") ?? "").split(";").map((part) => part.trim().toLowerCase());
  const markup = MARKUP_TYPES.has(type);
  if (!markup && !PLAIN_TYPES.has(type)) return null;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (response.body === null) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const charset = parameters.find((parameter) => parameter.startsWith("charset="))?.slice("charset=".length).replace(/["']/g, "");
  let text: string;
  try {
    text = new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    text = new TextDecoder("utf-8").decode(bytes);
  }
  return markup ? htmlToText(text) : text;
}

export async function verifyDrafts(options: {
  drafts: DraftFacts[];
  contact: string;
  deps: VerifyDeps;
}): Promise<VerifiedDraft[]> {
  const { drafts, contact, deps } = options;
  const userAgent = `TreeOfBooksContentTool/1.0 (${contact})`;
  const pages = new Map<string, Page>();
  const lastRequestAt = new Map<string, number>();

  async function keepSpacing(host: string): Promise<void> {
    const last = lastRequestAt.get(host);
    if (last === undefined) return;
    const elapsed = deps.now() - last;
    if (elapsed < HOST_SPACING_MS) await deps.sleep(HOST_SPACING_MS - elapsed);
  }

  /** One URL, with retries. Null when every attempt failed. Other answers (including 404) are returned as they are. */
  async function request(url: URL): Promise<Response | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      await keepSpacing(url.host);
      lastRequestAt.set(url.host, deps.now());
      let response: Response | null;
      try {
        response = await deps.fetch(url.href, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,text/plain;q=0.9" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        response = null;
      }
      if (response !== null && !RETRY_STATUSES.has(response.status)) return response;
      if (attempt === MAX_RETRIES) {
        if (response !== null) await discard(response);
        return null;
      }
      const wait = (response === null ? null : retryAfterMs(response, deps.now())) ?? RETRY_BACKOFF_MS[attempt];
      if (response !== null) await discard(response);
      await deps.sleep(wait);
    }
    return null;
  }

  async function fetchPage(raw: string): Promise<Page> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { kind: "blocked-url" };
    }
    for (let redirects = 0; ; redirects += 1) {
      const target = await checkTarget(url, deps.resolve);
      if (target === "blocked") return { kind: "blocked-url" };
      if (target === "unresolved") return { kind: "unreachable" };

      const response = await request(url);
      if (response === null) return { kind: "unreachable" };

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await discard(response);
        if (location === null) return { kind: "unreachable" };
        if (redirects >= MAX_REDIRECTS) return { kind: "blocked-url" };
        try {
          url = new URL(location, url);
        } catch {
          return { kind: "blocked-url" };
        }
        continue;
      }
      if (response.status < 200 || response.status > 299) {
        await discard(response);
        return { kind: "unreachable" };
      }
      const text = await readText(response);
      if (text === null) {
        await discard(response);
        return { kind: "unreachable" };
      }
      return { kind: "text", text: normalizeForMatch(text) };
    }
  }

  const results: VerifiedDraft[] = [];
  for (const draft of drafts) {
    const facts: VerifiedFact[] = [];
    for (const fact of draft.facts) {
      let page = pages.get(fact.sourceUrl);
      if (page === undefined) {
        if (pages.size >= MAX_URLS_PER_RUN) {
          page = { kind: "unreachable" };
        } else {
          page = await fetchPage(fact.sourceUrl);
          pages.set(fact.sourceUrl, page);
        }
      }
      let result: VerifyResult;
      if (page.kind === "text") {
        const evidence = normalizeForMatch(fact.evidence);
        result = evidence.length > 0 && page.text.includes(evidence) ? "verified" : "not-found";
      } else {
        result = page.kind;
      }
      facts.push({ claim: fact.claim, sourceUrl: fact.sourceUrl, result });
    }
    results.push({ slug: draft.slug, facts });
  }
  return results;
}
