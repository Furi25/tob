// Pictures the developer put in <out>/manual/ (docs/specs/book-cover-fetcher.md, "Sources"). Tried first; no request.
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";

export const MANUAL_RIGHTS = "Supplied by the developer.";

const EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

/** The first manual/<slug>.<ext> that exists, as its relative name and its bytes. */
export async function readManualFile(outDir: string, slug: string): Promise<{ name: string; bytes: Buffer } | null> {
  for (const extension of EXTENSIONS) {
    const name = `${slug}.${extension}`;
    try {
      return { name: `manual/${name}`, bytes: await readFile(path.join(outDir, "manual", name)) };
    } catch {
      // not there (or not readable): try the next name
    }
  }
  return null;
}
