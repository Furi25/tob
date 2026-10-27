// Configuration read from the environment (docs/specs/book-cover-fetcher.md, "Configuration").
// These variables are read only inside scripts/covers/. Error messages never repeat a value, so a key can't leak.
import { z } from "zod";

export type Config = { contact: string; googleBooksApiKey: string | null };
export type ConfigResult = { ok: true; config: Config } | { ok: false; errors: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isContact(value: string): boolean {
  if (EMAIL.test(value)) return true;
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

const EnvSchema = z.object({
  COVERS_CONTACT: z
    .string("COVERS_CONTACT is required")
    .trim()
    .refine((value) => value.length > 0, "COVERS_CONTACT is required")
    .refine((value) => value.length === 0 || isContact(value), "COVERS_CONTACT must be an email address or an https: URL"),
  GOOGLE_BOOKS_API_KEY: z.string().optional(),
});

export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const parsed = EnvSchema.safeParse({
    COVERS_CONTACT: env.COVERS_CONTACT,
    GOOGLE_BOOKS_API_KEY: env.GOOGLE_BOOKS_API_KEY,
  });
  if (!parsed.success) {
    return { ok: false, errors: [...new Set(parsed.error.issues.map((issue) => issue.message))] };
  }
  const key = parsed.data.GOOGLE_BOOKS_API_KEY?.trim();
  return { ok: true, config: { contact: parsed.data.COVERS_CONTACT, googleBooksApiKey: key ? key : null } };
}
