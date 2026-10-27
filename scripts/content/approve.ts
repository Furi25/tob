// The approval rules (docs/specs/book-content-tool.md, "Approve"). Pure: the command reads the files and writes the result.
import { createHash } from "node:crypto";
import { checkDraft, parseDraftText, type Issue } from "./check";
import type { Report } from "./report";
import type { ApprovedBook } from "./schema";

export type ApproveFlags = { acceptWarnings: boolean; skipVerification: boolean; replace: boolean };

export type ApproveInput = {
  slug: string;
  entry: { title: string; author: string };
  /** The raw bytes of the draft file, or null when there is none. */
  draftBytes: Buffer | null;
  report: Report | null;
  alreadyApproved: boolean;
};

export type ApproveDecision = { ok: true; book: ApprovedBook } | { ok: false; reasons: string[] };

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const describe = (issue: Issue) => `${issue.field}: ${issue.message}`;

export function decideApproval(input: ApproveInput, flags: ApproveFlags, now: Date): ApproveDecision {
  if (input.draftBytes === null) return { ok: false, reasons: ["there is no draft file for this book"] };

  const sha = sha256Hex(input.draftBytes);
  const parsed = parseDraftText(input.draftBytes.toString("utf8"));
  if (!parsed.ok) return { ok: false, reasons: [describe(parsed.issue)] };

  const reasons: string[] = [];
  const { errors, warnings } = checkDraft(parsed.value, { slug: input.slug, entry: input.entry });
  for (const error of errors) reasons.push(`error, ${describe(error)}`);

  // The report only counts if it was made for exactly this draft file.
  const reported = input.report?.drafts.find((item) => item.slug === input.slug && item.draftSha256 === sha);
  const verification = reported?.verification ?? null;
  const allWarnings = warnings.map(describe);
  if (!flags.skipVerification) {
    if (verification === null) {
      reasons.push("the draft has not been verified online since it last changed; run `check --verify-sources` or pass --skip-verification");
    } else if (verification.facts.some((fact) => fact.result !== "verified")) {
      allWarnings.push("online verification: not every fact was verified");
    }
  }
  if (allWarnings.length > 0 && !flags.acceptWarnings) {
    for (const warning of allWarnings) reasons.push(`warning, ${warning}; pass --accept-warnings to approve anyway`);
  }
  if (input.alreadyApproved && !flags.replace) reasons.push("it is already approved; pass --replace to replace it");
  if (reasons.length > 0 || errors.length > 0) return { ok: false, reasons };

  const state: ApprovedBook["review"]["verification"] = flags.skipVerification
    ? "skipped"
    : verification !== null && verification.facts.every((fact) => fact.result === "verified")
      ? "complete"
      : "partial";
  const draft = parsed.value as Omit<ApprovedBook, "review">;
  return {
    ok: true,
    book: {
      ...draft,
      review: {
        approvedAt: now.toISOString(),
        verification: state,
        warningsAccepted: flags.acceptWarnings,
        draftSha256: sha,
      },
    },
  };
}

/** The existing books with the new ones added or, for a repeated slug, put in place of the old one. Sorted by slug. */
export function mergeBooks(existing: ApprovedBook[], additions: ApprovedBook[]): ApprovedBook[] {
  const bySlug = new Map(existing.map((book) => [book.slug, book]));
  for (const book of additions) bySlug.set(book.slug, book);
  return [...bySlug.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
