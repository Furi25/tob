// Every number and word list the content tool uses, in one place (docs/specs/book-content-tool.md, "Limits").
// The prompt and the checker both read these values when they run, so the two always agree.

export const TEXT_FIELDS = ["tagline", "summary", "about", "whyPopular", "whyItMatters", "authorBio"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export type Limit = { min: number; max: number };

/** Allowed size per text field. The unit (characters or words) is in UNITS. */
export const LIMITS: Record<TextField, Limit> = {
  tagline: { min: 1, max: 240 },
  summary: { min: 140, max: 480 },
  about: { min: 80, max: 360 },
  whyPopular: { min: 80, max: 360 },
  whyItMatters: { min: 80, max: 360 },
  authorBio: { min: 50, max: 240 },
};

export const UNITS: Record<TextField, "characters" | "words"> = {
  tagline: "characters",
  summary: "characters",
  about: "words",
  whyPopular: "words",
  whyItMatters: "words",
  authorBio: "words",
};

export const SOURCES_LIMIT: Limit = { min: 2, max: 8 };
export const GENRE_LIMITS: { minCount: number; maxCount: number; maxLength: number } = { minCount: 1, maxCount: 5, maxLength: 40 };
export const MAX_FACTS = 30;
export const EVIDENCE_LIMIT: Limit = { min: 10, max: 300 };
export const MAX_NEEDS_REVIEW = 10;
export const MAX_NEEDS_REVIEW_LENGTH = 300;
export const MAX_QUOTE_WORDS = 15;
export const MAX_SLUG_LENGTH = 100;
export const MAX_BACKLOG_BOOKS = 100;
export const MAX_NOTES_LENGTH = 500;
export const MAX_NAME_LENGTH = 200;

/** Words that read as marketing. A draft that uses one gets a warning, not an error. */
export const HYPE_TERMS: readonly string[] = [
  "masterpiece",
  "unputdownable",
  "must-read",
  "page-turner",
  "tour de force",
  "game-changer",
  "groundbreaking",
  "riveting",
];

/** Words that mean "this text is not finished". */
export const PLACEHOLDER_WORDS: readonly string[] = ["placeholder", "lorem", "todo", "tbd"];

// Online verification.
export const MAX_URLS_PER_RUN = 200;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 20_000;
export const HOST_SPACING_MS = 1000;
export const MAX_REDIRECTS = 3;
export const MAX_RETRIES = 2;
export const RETRY_BACKOFF_MS: readonly number[] = [2000, 4000];
export const MAX_RETRY_AFTER_MS = 60_000;

export const CONTACT_LIMIT: Limit = { min: 3, max: 200 };
