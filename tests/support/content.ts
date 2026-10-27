// Shared helpers for the content-tool tests (docs/specs/book-content-tool.md).
//
// MODULE CONTRACTS, pinned in the spec under "Module contracts (pinned)". Everything else is tested through the real CLI
// (see tests/support/content-run.ts).
//
//   scripts/content/limits.ts    GENRE_LIMITS: { minCount: number; maxCount: number; maxLength: number }   (1, 5 and 40 at first)
//                                LIMITS: Record<"tagline" | "summary" | "about" | "whyPopular" | "whyItMatters" | "authorBio",
//                                              { min: number; max: number }>     (characters for tagline/summary, words otherwise)
//                                HYPE_TERMS: readonly string[]
//   scripts/content/check.ts     checkDraft(draft: unknown, context: { slug: string; entry: { title: string; author: string } }):
//                                  { errors: Issue[]; warnings: Issue[] }          Issue = { field, rule, message }
//                                `context.slug` is the draft file's name without ".json"; `entry` is the backlog entry.
//                                An Issue's `field` is the property name ("about"), or starts with it for nested problems
//                                ("facts.0.sourceUrl"); for an unknown key it is the key itself.
//   scripts/content/brief.ts     renderPrompt(entry: { slug: string; title: string; author: string }, notes: unknown | null): string
//   scripts/content/verify.ts    verifyDrafts({ drafts: Draft[], contact: string, deps: { fetch, resolve, sleep, now } }):
//                                  Promise<{ slug: string; facts: { claim; sourceUrl; result }[] }[]>
//                                `resolve(hostname)` returns every address the name resolves to; `sleep` and `now` are the clock.
//                                One call is one run: the per-URL cache and the 200-URL limit span all the drafts given.
//   scripts/content/cli.ts       `tsx scripts/content/cli.ts <status|brief|check|approve> ...`; paths (docs/book-backlog.json,
//                                .content/) are resolved against the current working directory, so the CLI tests can run it
//                                in a temporary folder.
//   draft file hash              draftSha256 is the SHA-256 (lower-case hex) of the draft file's bytes.
import { createHash } from "node:crypto";
import { z } from "zod";
import { slugify } from "../../src/lib/slug";

export { forbidRealFetch } from "./covers";

export type Fact = { claim: string; sourceUrl: string; evidence: string };
export type Draft = {
  version: 1;
  slug: string;
  title: string;
  author: string;
  tagline: string;
  summary: string;
  about: string;
  whyPopular: string;
  whyItMatters: string;
  authorBio: string;
  genres: string[];
  sources: string[];
  facts: Fact[];
  confidence: "high" | "medium" | "low";
  needsReview: string[];
  drafter: string;
};
export type Issue = { field: string; rule: string; message: string };
export type CheckResult = { errors: Issue[]; warnings: Issue[] };

export const TEXT_FIELDS = ["tagline", "summary", "about", "whyPopular", "whyItMatters", "authorBio"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];
export const isWordField = (field: TextField) => field !== "tagline" && field !== "summary";

export type Limits = Record<TextField, { min: number; max: number }>;
export type GenreLimits = { minCount: number; maxCount: number; maxLength: number };

export async function loadLimits() {
  const mod = await import("../../scripts/content/limits");
  return {
    LIMITS: mod.LIMITS as Limits,
    HYPE_TERMS: mod.HYPE_TERMS as readonly string[],
    GENRE_LIMITS: mod.GENRE_LIMITS as GenreLimits,
  };
}

export const CONTACT = "tests@example.org";
export const USER_AGENT = `TreeOfBooksContentTool/1.0 (${CONTACT})`;

export const sha256 = (input: Buffer | string) => createHash("sha256").update(input).digest("hex");

// ---------------------------------------------------------------------------------------------------------------
// Text of an exact size. Plain words only: no digits, no hype terms, no placeholder words.
// ---------------------------------------------------------------------------------------------------------------

const WORDS = [
  "river", "lantern", "quiet", "harbour", "winter", "orchard", "letter", "garden", "mirror", "thread", "copper", "window",
  "meadow", "candle", "station", "valley", "ribbon", "anchor", "bridge", "island", "forest", "kettle", "shadow", "marble",
  "pasture", "lighthouse", "compass", "blanket", "village", "evening", "thunder", "feather", "chimney", "journey", "market",
  "silver", "amber", "willow", "harvest", "pebble",
];

export const words = (count: number, start = 0) =>
  Array.from({ length: Math.max(0, count) }, (_, i) => WORDS[(start + i) % WORDS.length]).join(" ");

export function textOfLength(length: number): string {
  if (length <= 0) return "";
  let text = "";
  let i = 0;
  while (Array.from(text).length < length) text += (text ? " " : "") + WORDS[i++ % WORDS.length];
  const cut = Array.from(text).slice(0, length);
  if (cut[cut.length - 1] === " ") cut[cut.length - 1] = "a";
  return cut.join("");
}

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export const codePoints = (text: string) => Array.from(text).length;

/** A value of exactly `size` words (word fields) or characters (tagline, summary). */
export const sizedText = (field: TextField, size: number) => (isWordField(field) ? words(size) : textOfLength(size));

const middle = (limit: { min: number; max: number }) => Math.floor((limit.min + limit.max) / 2);

// ---------------------------------------------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------------------------------------------

export const SOURCE_A = "https://publisher.example.com/the-test-book";
export const SOURCE_B = "https://news.example.org/review-of-the-test-book";

/** A draft that satisfies every rule in the spec: sizes in the middle of each limit, no figures, no facts. */
export async function validDraft(over: Partial<Draft> = {}): Promise<Draft> {
  const { LIMITS } = await loadLimits();
  return {
    version: 1,
    slug: "the-test-book",
    title: "The Test Book",
    author: "Ada Writer",
    tagline: textOfLength(middle(LIMITS.tagline)),
    summary: textOfLength(middle(LIMITS.summary)),
    about: words(middle(LIMITS.about)),
    whyPopular: words(middle(LIMITS.whyPopular), 3),
    whyItMatters: words(middle(LIMITS.whyItMatters), 7),
    authorBio: words(middle(LIMITS.authorBio), 11),
    genres: ["Gothic fiction", "Classic literature"],
    sources: [SOURCE_A, SOURCE_B],
    facts: [],
    confidence: "high",
    needsReview: [],
    drafter: "Claude (test fixture)",
    ...over,
  };
}

/** A valid draft for another book; the slug comes from the shared slugify, as the spec says. */
export const draftFor = (title: string, author: string, over: Partial<Draft> = {}) =>
  validDraft({ title, author, slug: slugify(title), ...over });

export const factFor = (claim: string, sourceUrl = SOURCE_A): Fact => ({
  claim,
  sourceUrl,
  evidence: `The page says ${claim} in plain words`,
});

/** The same draft with `phrase` put in front of one text field. */
export const withPhrase = (draft: Draft, field: TextField, phrase: string): Draft => ({ ...draft, [field]: `${phrase} ${draft[field]}` });

/** A draft whose `about` begins with a phrase and that carries one fact for it. */
export async function draftWithFact(claim: string, over: Partial<Draft> = {}) {
  const base = await draftFor("Alpha One", "Ann Author", over);
  return { ...withPhrase(base, "about", `In ${claim} it grew.`), facts: [factFor(claim)] } satisfies Draft;
}

export const issueFields = (result: CheckResult) => result.errors.map((issue) => issue.field);

/** True when some issue names `field` itself or something inside it ("facts.0.sourceUrl"). */
export const names = (issues: Issue[], field: string) =>
  issues.some((issue) => issue.field === field || issue.field.startsWith(`${field}.`) || issue.field.startsWith(`${field}[`));

export const messages = (issues: Issue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`).join("\n");

// ---------------------------------------------------------------------------------------------------------------
// Report and output schemas, written from the spec so the tests do not depend on the tool's own exports.
// ---------------------------------------------------------------------------------------------------------------

const Iso = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)), "an ISO 8601 date");
const IssueSchema = z.object({ field: z.string(), rule: z.string(), message: z.string() });
export const FactResultSchema = z.object({
  claim: z.string(),
  sourceUrl: z.string(),
  result: z.enum(["verified", "not-found", "unreachable", "blocked-url"]),
});
export type FactResult = z.infer<typeof FactResultSchema>;

export const CheckReportSchema = z.object({
  generatedAt: z.string(),
  drafts: z.array(
    z.object({
      slug: z.string(),
      draftSha256: z.string(),
      errors: z.array(IssueSchema),
      warnings: z.array(IssueSchema),
      verification: z.nullable(z.object({ facts: z.array(FactResultSchema) })),
    }),
  ),
});
export type CheckReport = z.infer<typeof CheckReportSchema>;

export const ContentFileSchema = z.object({
  version: z.literal(1),
  generated: Iso,
  books: z.array(
    z.looseObject({
      slug: z.string(),
      review: z.object({
        approvedAt: Iso,
        verification: z.enum(["complete", "partial", "skipped"]),
        warningsAccepted: z.boolean(),
        draftSha256: z.string(),
      }),
    }),
  ),
});
export type ContentFile = z.infer<typeof ContentFileSchema>;

/** A book as it sits in the output file: the draft plus a `review` block. */
export const approvedBook = (draft: Draft, over: Partial<{ approvedAt: string; verification: "complete" | "partial" | "skipped"; warningsAccepted: boolean }> = {}) => ({
  ...draft,
  review: {
    approvedAt: "2026-10-25T12:00:00.000Z",
    verification: "complete" as const,
    warningsAccepted: false,
    draftSha256: "0".repeat(64),
    ...over,
  },
});

export const outputFile = (...books: ReturnType<typeof approvedBook>[]) => ({
  version: 1,
  generated: "2026-10-25T12:00:00.000Z",
  books: [...books].sort((a, b) => a.slug.localeCompare(b.slug)),
});

// ---------------------------------------------------------------------------------------------------------------
// Fake network for the in-process verification tests: fake fetch, fake DNS, virtual clock, no real waiting.
// ---------------------------------------------------------------------------------------------------------------

export type NetCall = {
  url: string;
  host: string;
  path: string;
  method: string;
  headers: Headers;
  /** Virtual time (ms) at which the request was made. */
  at: number;
};

export type NetResponder = (url: URL, call: NetCall, index: number) => Response | Promise<Response> | undefined;

export const PUBLIC_ADDRESS = "93.184.216.34";

export function createNet(respond: NetResponder, resolves: Record<string, string[]> = {}) {
  let clock = 5_000_000;
  let inFlight = 0;
  let peak = 0;
  const calls: NetCall[] = [];
  const sleeps: number[] = [];
  const resolved: string[] = [];

  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const call: NetCall = {
      url: url.href,
      host: url.host,
      path: url.pathname,
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      headers: new Headers(init?.headers ?? request?.headers),
      at: clock,
    };
    calls.push(call);
    const index = calls.length - 1;
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      // One real turn of the event loop, so a tool that fires requests concurrently is seen as overlapping.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return (await respond(url, call, index)) ?? new Response("", { status: 404 });
    } finally {
      inFlight -= 1;
    }
  };

  return {
    calls,
    sleeps,
    resolved,
    peakInFlight: () => peak,
    deps: {
      fetch: fakeFetch as typeof fetch,
      resolve: async (hostname: string) => {
        resolved.push(hostname);
        return resolves[hostname] ?? [PUBLIC_ADDRESS];
      },
      sleep: async (ms: number) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
    },
  };
}

export const htmlResponse = (html: string, type = "text/html; charset=utf-8") =>
  new Response(html, { status: 200, headers: { "content-type": type } });

/** A small HTML page whose visible text is `text` (which may itself contain markup). */
export const pageOf = (text: string) => `<!doctype html><html><head><title>t</title></head><body><main><p>${text}</p></main></body></html>`;

export const statusResponse = (code: number, headers: Record<string, string> = {}) => new Response("", { status: code, headers });

export const redirectResponse = (location: string, code = 302) => new Response(null, { status: code, headers: { location } });

export const callsTo = (calls: NetCall[], host: string) => calls.filter((call) => call.host === host);
