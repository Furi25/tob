// The check report (docs/specs/book-content-tool.md, "Files"): what `check` found for each draft, and what the
// online verification said. `approve` reads it to learn whether the draft it is about to approve was verified.
import { z } from "zod";
import type { Issue } from "./schema";

const IssueSchema = z.object({ field: z.string(), rule: z.string(), message: z.string() });

export const ReportSchema = z.object({
  generatedAt: z.iso.datetime(),
  drafts: z.array(
    z.object({
      slug: z.string(),
      draftSha256: z.string(),
      errors: z.array(IssueSchema),
      warnings: z.array(IssueSchema),
      verification: z
        .object({
          facts: z.array(
            z.object({
              claim: z.string(),
              sourceUrl: z.string(),
              result: z.enum(["verified", "not-found", "unreachable", "blocked-url"]),
            }),
          ),
        })
        .nullable(),
    }),
  ),
});
export type Report = z.infer<typeof ReportSchema>;
export type ReportEntry = Report["drafts"][number];

export function buildReport(generatedAt: Date, drafts: ReportEntry[]): Report {
  return { generatedAt: generatedAt.toISOString(), drafts };
}

/** The report found in a file's text, or null when it is missing or not a report. */
export function parseReport(text: string | null): Report | null {
  if (text === null) return null;
  try {
    const parsed = ReportSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type { Issue };
