// The prompt that asks an AI assistant to draft the content of one book (docs/specs/book-content-tool.md, "Brief").
// The text is deterministic: the same book and notes give the same bytes. It names no file, no date and no secret.
import { z } from "zod";
import { EVIDENCE_LIMIT, GENRE_LIMITS, HYPE_TERMS, LIMITS, MAX_FACTS, MAX_NEEDS_REVIEW, MAX_QUOTE_WORDS, SOURCES_LIMIT, TEXT_FIELDS, UNITS, type TextField } from "./limits";

export type PromptEntry = { slug: string; title: string; author: string };

const NotesSchema = z.object({
  title: z.string(),
  author: z.string(),
  genre: z.string().optional(),
  publisher: z.string().optional(),
  first_published: z.union([z.string(), z.number()]).optional(),
  about: z.string().optional(),
  why_popular: z.array(z.string()).optional(),
  author_bio: z.string().optional(),
  sources: z.array(z.string()).optional(),
});
type Notes = z.infer<typeof NotesSchema>;

/** Lower case, no accents, letters and digits only, single spaces: the form two spellings are compared in. */
export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The notes about a book in the reference list, matched on both title and author. Null when there are none. */
export function findNotes(reference: unknown, entry: { title: string; author: string }): unknown {
  const list = z.object({ books: z.array(z.unknown()) }).safeParse(reference);
  if (!list.success) return null;
  const title = normalizeName(entry.title);
  const author = normalizeName(entry.author);
  for (const candidate of list.data.books) {
    const notes = NotesSchema.safeParse(candidate);
    if (notes.success && normalizeName(notes.data.title) === title && normalizeName(notes.data.author) === author) {
      return candidate;
    }
  }
  return null;
}

const FIELD_HELP: Record<TextField, string> = {
  tagline: "one line that makes a reader curious; no full stop at the end",
  summary: "a spoiler-free pitch, as for a search result",
  about: "what the book is about, as far as the opening set-up",
  whyPopular: "why readers pick it up and pass it on",
  whyItMatters: "what lasting value it has, for literature or for a reader",
  authorBio: "who the author is and what else they wrote",
};

function renderNotes(notes: Notes): string[] {
  const lines = ["## Starting notes (unverified)", "", "These notes may be wrong or out of date. Check each point against a source before you use it.", ""];
  if (notes.genre) lines.push(`- Genre: ${notes.genre}`);
  if (notes.publisher) lines.push(`- Publisher: ${notes.publisher}`);
  if (notes.first_published !== undefined) lines.push(`- First published: ${notes.first_published}`);
  if (notes.about) lines.push(`- About: ${notes.about}`);
  for (const reason of notes.why_popular ?? []) lines.push(`- Why it is popular: ${reason}`);
  if (notes.author_bio) lines.push(`- Author: ${notes.author_bio}`);
  for (const source of notes.sources ?? []) lines.push(`- Source seen earlier: ${source}`);
  lines.push("");
  return lines;
}

export function renderPrompt(entry: PromptEntry, notes: unknown): string {
  const skeleton = {
    version: 1,
    slug: entry.slug,
    title: entry.title,
    author: entry.author,
    tagline: "",
    summary: "",
    about: "",
    whyPopular: "",
    whyItMatters: "",
    authorBio: "",
    genres: [] as string[],
    sources: [] as string[],
    facts: [] as { claim: string; sourceUrl: string; evidence: string }[],
    confidence: "high",
    needsReview: [] as string[],
    drafter: "",
  };
  const parsedNotes = notes === null || notes === undefined ? null : NotesSchema.safeParse(notes);

  const lines: string[] = [
    `# Write the web content for "${entry.title}" by ${entry.author}`,
    "",
    "You are writing the text for one book page on a book discovery site. Write as a critic who is also a storyteller:",
    "a critic is honest and specific, a storyteller is vivid and makes the reader want to open the book.",
    "",
    "## Voice and rules",
    "",
    "- Write in English.",
    "- Describe the plot in the present tense. Describe the author's life and the book's history in the past tense.",
    "- Include at least one honest reservation, a real limit or a kind of reader who may not enjoy the book.",
    `- Leave out hype. Do not use promotional words such as: ${HYPE_TERMS.join(", ")}.`,
    "- Rely on reputable sources: publishers, libraries, encyclopedias, established newspapers and the author's own site.",
    "- Never reveal a spoiler. Stay within the opening set-up of the story, and do not give away a twist or the ending.",
    `- Quote at most ${MAX_QUOTE_WORDS} words in a row from any source, and put them in double quotation marks.`,
    "- Plain text only: no HTML, no Markdown, no line breaks inside a field, no placeholder text.",
    "- Do not guess. If you are not sure of a point, leave it out, or keep it and add a note to needsReview.",
    "",
    "## Sources and facts",
    "",
    "If you can browse, open web pages and read the sources yourself. If you have no web access, write only what you",
    'know well, set confidence to "low", and say in needsReview that nothing could be looked up.',
    "Do not invent URLs or evidence quotes. A source URL must be one you really opened, and an evidence quote must be text really on that page.",
    "",
    `Give ${SOURCES_LIMIT.min} to ${SOURCES_LIMIT.max} sources, as https URLs on at least two different websites.`,
    `Every figure in your text (a year, a count, a percentage) needs a fact. Give at most ${MAX_FACTS} facts.`,
    "Each entry in facts has three parts:",
    "",
    "- claim: the figure or statement, copied word for word from your own text;",
    "- sourceUrl: one of the URLs in sources;",
    `- evidence: a short passage copied from that page that backs the claim, ${EVIDENCE_LIMIT.min} to ${EVIDENCE_LIMIT.max} characters.`,
    "",
    "Set confidence to \"high\", \"medium\" or \"low\", and use \"low\" when much of the text rests on memory.",
    `List in needsReview, at most ${MAX_NEEDS_REVIEW} short notes, anything a person should check before this is published.`,
    "Set drafter to the name of the assistant you are.",
    "",
    "## Fields",
    "",
    "| Field | Size | What it holds |",
    "| --- | --- | --- |",
    ...TEXT_FIELDS.map((field) => `| ${field} | ${LIMITS[field].min} to ${LIMITS[field].max} ${UNITS[field]} | ${FIELD_HELP[field]} |`),
    `| genres | ${GENRE_LIMITS.minCount} to ${GENRE_LIMITS.maxCount} genres, each ${GENRE_LIMITS.minCount} to ${GENRE_LIMITS.maxLength} characters | a list of short genre names, most specific first |`,
    "",
    `Give genres as short genre names in English, such as "Gothic fiction" or "Science fiction". Use ${GENRE_LIMITS.minCount} to ${GENRE_LIMITS.maxCount} genres, each at most ${GENRE_LIMITS.maxLength} characters, and no two the same.`,
    "",
    "## Reply",
    "",
    "Reply with one JSON object in a single code block, and nothing else. Fill in this skeleton and keep every key:",
    "",
    "```json",
    JSON.stringify(skeleton, null, 2),
    "```",
    "",
  ];

  if (parsedNotes?.success) lines.push(...renderNotes(parsedNotes.data));
  return `${lines.join("\n").trimEnd()}\n`;
}
