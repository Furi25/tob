// The report written next to the images (docs/specs/book-cover-fetcher.md, "Report").
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const SourceNameSchema = z.enum(["manual", "openlibrary", "google-books", "wikimedia-commons"]);
export type SourceName = z.infer<typeof SourceNameSchema>;

export const OutcomeSchema = z.enum([
  "used",
  "no-match",
  "no-cover",
  "bad-ratio",
  "too-small",
  "not-an-image",
  "http-error",
  "rate-limited",
  "skipped-no-key",
  "source-disabled",
  "budget-exhausted",
]);
export type Outcome = z.infer<typeof OutcomeSchema>;

const SizeSchema = z.object({ width: z.number().int().positive(), height: z.number().int().positive() });

export const AttemptSchema = z.object({ source: SourceNameSchema, outcome: OutcomeSchema, detail: z.string().optional() });
export type Attempt = z.infer<typeof AttemptSchema>;

export const ReportEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  author: z.string(),
  isbn: z.string().nullable(),
  status: z.enum(["ok", "skipped", "missing", "failed"]),
  file: z.string().nullable(),
  source: SourceNameSchema.nullable(),
  sourceUrl: z.string().nullable(),
  rights: z.string().nullable(),
  originalSize: SizeSchema.nullable(),
  outputSize: SizeSchema.nullable(),
  cropped: z.boolean().nullable(),
  attempts: z.array(AttemptSchema),
});
export type ReportEntry = z.infer<typeof ReportEntrySchema>;

export const ReportSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  interrupted: z.boolean(),
  books: z.array(ReportEntrySchema),
});
export type Report = z.infer<typeof ReportSchema>;

export const reportPath = (outDir: string) => path.join(outDir, "report.json");

/** The report of the previous run, or null when there is none or it cannot be read. */
export async function readReport(outDir: string): Promise<Report | null> {
  try {
    const parsed = ReportSchema.safeParse(JSON.parse(await readFile(reportPath(outDir), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Validates, then writes through a .tmp file so an interrupted write never leaves half a report. */
export async function writeReport(outDir: string, report: Report): Promise<void> {
  const valid = ReportSchema.parse(report);
  const target = reportPath(outDir);
  const temporary = `${target}.tmp`;
  await mkdir(outDir, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(valid, null, 2)}\n`);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
