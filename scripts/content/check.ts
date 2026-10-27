// The offline rules for one draft (docs/specs/book-content-tool.md, "Checks"). Pure: no files, no network.
import {
  EVIDENCE_LIMIT,
  GENRE_LIMITS,
  HYPE_TERMS,
  LIMITS,
  MAX_FACTS,
  MAX_NEEDS_REVIEW,
  MAX_NEEDS_REVIEW_LENGTH,
  MAX_QUOTE_WORDS,
  PLACEHOLDER_WORDS,
  SOURCES_LIMIT,
  TEXT_FIELDS,
  UNITS,
  type TextField,
} from "./limits";
import { DraftSchema, ReviewSchema, zodIssues, type Draft, type Issue } from "./schema";

export type { Issue } from "./schema";
export type CheckContext = { slug: string; entry: { title: string; author: string } };
export type CheckResult = { errors: Issue[]; warnings: Issue[] };

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const FIGURE = /\d+(?:[.,]\d+)*/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWord(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "iu");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

function figuresIn(text: string): string[] {
  return text.match(FIGURE) ?? [];
}

function quotedSpans(text: string): string[] {
  const spans: string[] = [];
  for (const pattern of [/"([^"]*)"/g, /\u201c([^\u201d]*)\u201d/g]) {
    for (const match of text.matchAll(pattern)) spans.push(match[1]);
  }
  return spans;
}

/** Rules 1 to 3, which hold for every piece of text: one line, plain text, no unfinished-text marker. */
function checkPlain(field: string, value: string, errors: Issue[]): void {
  const add = (rule: string, message: string) => errors.push({ field, rule, message });
  if (value !== value.trim()) add("whitespace", "starts or ends with white space");
  if (CONTROL_CHARACTERS.test(value)) add("control-character", "contains a control character, new line or tab");
  if (/<[A-Za-z/]/.test(value)) add("html", "contains HTML");
  if (value.includes("`") || value.includes("**") || /^#/.test(value) || /\[[^\]]*\]\([^)]*\)/.test(value)) {
    add("markdown", "contains Markdown; write plain text");
  }
  for (const word of PLACEHOLDER_WORDS) {
    if (wholeWord(word).test(value)) add("placeholder", `contains the unfinished-text marker "${word}"`);
  }
}

/** Size, markup, placeholder and quotation rules for one prose field. */
function checkText(field: TextField, value: string, errors: Issue[]): void {
  const add = (rule: string, message: string) => errors.push({ field, rule, message });
  const limit = LIMITS[field];
  const unit = UNITS[field];
  const size = unit === "words" ? countWords(value) : Array.from(value).length;
  if (size < limit.min || size > limit.max) {
    add("length", `has ${size} ${unit}; it must have ${limit.min} to ${limit.max} ${unit}`);
  }
  checkPlain(field, value, errors);
  if (field === "tagline" && value.trimEnd().endsWith(".")) add("tagline-full-stop", "must not end with a full stop");
  for (const span of quotedSpans(value)) {
    if (countWords(span) > MAX_QUOTE_WORDS) add("quote-length", `quotes more than ${MAX_QUOTE_WORDS} words`);
  }
}

/** Genres are labels, not prose: rules 1 to 3 apply, the quote and figure rules do not. */
function checkGenres(draft: Draft, errors: Issue[]): void {
  const { minCount, maxCount, maxLength } = GENRE_LIMITS;
  const { genres } = draft;
  if (genres.length < minCount || genres.length > maxCount) {
    errors.push({
      field: "genres",
      rule: "count",
      message: `has ${genres.length} genres; it must have ${minCount} to ${maxCount}`,
    });
  }
  const seen = new Set<string>();
  genres.forEach((genre, index) => {
    const field = `genres.${index}`;
    const length = Array.from(genre).length;
    if (length < 1 || length > maxLength) {
      errors.push({ field, rule: "length", message: `has ${length} characters; it must have 1 to ${maxLength}` });
    }
    checkPlain(field, genre, errors);
    const key = genre.toLowerCase();
    if (seen.has(key)) errors.push({ field: "genres", rule: "duplicate", message: `lists "${genre}" twice` });
    seen.add(key);
  });
}

function checkSources(draft: Draft, errors: Issue[]): void {
  const add = (field: string, rule: string, message: string) => errors.push({ field, rule, message });
  const { sources } = draft;
  if (sources.length < SOURCES_LIMIT.min || sources.length > SOURCES_LIMIT.max) {
    add("sources", "count", `has ${sources.length} sources; it must have ${SOURCES_LIMIT.min} to ${SOURCES_LIMIT.max}`);
  }
  const seen = new Set<string>();
  const hosts = new Set<string>();
  sources.forEach((source, index) => {
    let url: URL | null = null;
    try {
      url = new URL(source);
    } catch {
      url = null;
    }
    if (url === null || url.protocol !== "https:") {
      add(`sources.${index}`, "url", "must be a valid https: URL");
      return;
    }
    if (seen.has(url.href)) add(`sources.${index}`, "duplicate", "is listed twice");
    seen.add(url.href);
    hosts.add(url.hostname);
  });
  if (hosts.size < 2) add("sources", "hosts", "must come from at least two different websites");
}

function checkFacts(draft: Draft, errors: Issue[]): void {
  const add = (field: string, rule: string, message: string) => errors.push({ field, rule, message });
  const prose = TEXT_FIELDS.map((field) => draft[field]).join("\n");

  if (draft.facts.length > MAX_FACTS) add("facts", "count", `has ${draft.facts.length} facts; the most allowed is ${MAX_FACTS}`);
  draft.facts.forEach((fact, index) => {
    if (!draft.sources.includes(fact.sourceUrl)) {
      add(`facts.${index}.sourceUrl`, "fact-source", "is not one of the listed sources");
    }
    const evidenceLength = Array.from(fact.evidence).length;
    if (evidenceLength < EVIDENCE_LIMIT.min || evidenceLength > EVIDENCE_LIMIT.max) {
      add(
        `facts.${index}.evidence`,
        "evidence-length",
        `has ${evidenceLength} characters; it must have ${EVIDENCE_LIMIT.min} to ${EVIDENCE_LIMIT.max}`,
      );
    }
    if (!prose.includes(fact.claim)) {
      add(`facts.${index}.claim`, "claim-not-in-text", "is not found word for word in the text of the book");
    }
  });

  // Every number in the prose needs a fact, so a number can never be an unchecked guess.
  const claimed = new Set(draft.facts.flatMap((fact) => figuresIn(fact.claim)));
  const inTitle = new Set(figuresIn(draft.title));
  for (const field of TEXT_FIELDS) {
    for (const figure of new Set(figuresIn(draft[field]))) {
      if (!inTitle.has(figure) && !claimed.has(figure)) {
        add(field, "figure-without-fact", `the figure "${figure}" has no fact that backs it`);
      }
    }
  }
}

function checkNeedsReview(draft: Draft, errors: Issue[]): void {
  if (draft.needsReview.length > MAX_NEEDS_REVIEW) {
    errors.push({
      field: "needsReview",
      rule: "count",
      message: `has ${draft.needsReview.length} entries; the most allowed is ${MAX_NEEDS_REVIEW}`,
    });
  }
  draft.needsReview.forEach((note, index) => {
    if (Array.from(note).length > MAX_NEEDS_REVIEW_LENGTH) {
      errors.push({
        field: `needsReview.${index}`,
        rule: "length",
        message: `is longer than ${MAX_NEEDS_REVIEW_LENGTH} characters`,
      });
    }
  });
}

export function checkDraft(draft: unknown, context: CheckContext): CheckResult {
  const parsed = DraftSchema.safeParse(draft);
  if (!parsed.success) return { errors: zodIssues(parsed.error), warnings: [] };
  const value = parsed.data;

  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  if (value.slug !== context.slug) {
    errors.push({ field: "slug", rule: "slug-mismatch", message: `must be "${context.slug}", the name of the book's file` });
  }
  if (value.title.trim() !== context.entry.title.trim()) {
    errors.push({ field: "title", rule: "title-mismatch", message: `must be "${context.entry.title}", as in the backlog` });
  }
  if (value.author.trim() !== context.entry.author.trim()) {
    errors.push({ field: "author", rule: "author-mismatch", message: `must be "${context.entry.author}", as in the backlog` });
  }

  for (const field of TEXT_FIELDS) checkText(field, value[field], errors);
  checkGenres(value, errors);
  checkSources(value, errors);
  checkFacts(value, errors);
  checkNeedsReview(value, errors);

  if (value.confidence !== "high") {
    warnings.push({ field: "confidence", rule: "confidence", message: `the drafter's confidence is "${value.confidence}"` });
  }
  if (value.needsReview.length > 0) {
    warnings.push({ field: "needsReview", rule: "needs-review", message: "the drafter listed points a person should check" });
  }
  for (const field of TEXT_FIELDS) {
    for (const term of HYPE_TERMS) {
      if (wholeWord(term).test(value[field])) {
        warnings.push({ field, rule: "hype", message: `uses the promotional phrase "${term}"` });
      }
    }
  }
  return { errors, warnings };
}

/** The same rules for an entry of the approved file: the `review` block is checked by shape, the rest as a draft. */
export function checkApprovedEntry(entry: unknown, context: CheckContext): CheckResult {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return { errors: [{ field: "(file)", rule: "structure", message: "an entry must be an object" }], warnings: [] };
  }
  const { review, ...rest } = entry as Record<string, unknown>;
  const result = checkDraft(rest, context);
  const reviewResult = ReviewSchema.safeParse(review);
  if (!reviewResult.success) {
    const issues =
      review === undefined
        ? [{ field: "review", rule: "structure", message: "the review block is missing" }]
        : zodIssues(reviewResult.error).map((issue) => ({ ...issue, field: `review.${issue.field}`.replace(/\.\(file\)$/, "") }));
    result.errors.push(...issues);
  }
  return result;
}

export type ParsedDraftFile = { ok: true; value: unknown } | { ok: false; issue: Issue };

/** Reads a draft file's text. A reply pasted with Markdown fences gets its own message. */
export function parseDraftText(text: string): ParsedDraftFile {
  const body = text.replace(/^\uFEFF/, "");
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    const fenced = /^\s*```/.test(body);
    return {
      ok: false,
      issue: {
        field: "(file)",
        rule: fenced ? "markdown-fences" : "json",
        message: fenced
          ? "the file is wrapped in Markdown code fences; save only the JSON object"
          : "the file is not valid JSON",
      },
    };
  }
}
