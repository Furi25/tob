// The shapes of the files the tool reads and writes (docs/specs/book-content-tool.md, "Files").
import { z } from "zod";
import { MAX_SLUG_LENGTH } from "./limits";

export type Issue = { field: string; rule: string; message: string };

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True for a string that is safe to use as a file name: lower-case words joined by single dashes. */
export function isValidSlug(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

const slugSchema = z.string().max(MAX_SLUG_LENGTH).regex(SLUG_PATTERN);

export const FactSchema = z.strictObject({
  claim: z.string().min(1),
  sourceUrl: z.string().min(1),
  evidence: z.string(),
});

export const DraftSchema = z.strictObject({
  version: z.literal(1),
  slug: slugSchema,
  title: z.string().min(1),
  author: z.string().min(1),
  tagline: z.string(),
  summary: z.string(),
  about: z.string(),
  whyPopular: z.string(),
  whyItMatters: z.string(),
  authorBio: z.string(),
  genres: z.array(z.string()),
  sources: z.array(z.string()),
  facts: z.array(FactSchema),
  confidence: z.enum(["high", "medium", "low"]),
  needsReview: z.array(z.string()),
  drafter: z.string().min(1),
});
export type Draft = z.infer<typeof DraftSchema>;

export const ReviewSchema = z.strictObject({
  approvedAt: z.iso.datetime(),
  verification: z.enum(["complete", "partial", "skipped"]),
  warningsAccepted: z.boolean(),
  draftSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ApprovedBookSchema = DraftSchema.extend({ review: ReviewSchema });
export type ApprovedBook = z.infer<typeof ApprovedBookSchema>;

export const ContentFileSchema = z.strictObject({
  version: z.literal(1),
  generated: z.iso.datetime(),
  books: z.array(ApprovedBookSchema),
});
export type ContentFile = z.infer<typeof ContentFileSchema>;

/** The same file read loosely: only the outer shape, so entries can be checked one by one. */
export const LooseContentFileSchema = z.object({
  version: z.literal(1),
  generated: z.iso.datetime(),
  books: z.array(z.unknown()),
});

/** Turns Zod issues into our own, one per problem. An unknown key becomes an issue on that key. */
export function zodIssues(error: z.ZodError): Issue[] {
  const issues: Issue[] = [];
  for (const issue of error.issues) {
    const base = issue.path.map(String);
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        issues.push({ field: [...base, key].join("."), rule: "unknown-key", message: `"${key}" is not a field of this file` });
      }
      continue;
    }
    issues.push({ field: base.length > 0 ? base.join(".") : "(file)", rule: "structure", message: issue.message });
  }
  return issues;
}
