// Spec: docs/specs/book-cover-fetcher.md, criterion 41 (configuration). See tests/support/covers.ts for the assumed
// loadConfig signature. The part about a real variable beating a .env value is not tested here: the spec does not say
// where that merge happens (see the report's coverage gaps).
import { describe, expect, it } from "vitest";

const load = async (env: Record<string, string | undefined>) => (await import("./config")).loadConfig(env);

describe("#41 COVERS_CONTACT", () => {
  it.each([
    ["dev@example.org"],
    ["https://example.org/contact"],
  ])("accepts %j", async (contact) => {
    const result = await load({ COVERS_CONTACT: contact });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.contact).toBe(contact);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
    ["neither an email nor a URL", "not a contact"],
    ["a plain http URL", "http://example.org/contact"],
    ["a javascript URL", "javascript:alert(1)"],
    ["an ftp URL", "ftp://example.org"],
  ])("rejects a contact that is %s", async (_label, contact) => {
    const result = await load({ COVERS_CONTACT: contact });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("#41 GOOGLE_BOOKS_API_KEY", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("counts a key that is %s as not set", async (_label, key) => {
    const result = await load({ COVERS_CONTACT: "dev@example.org", GOOGLE_BOOKS_API_KEY: key });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.googleBooksApiKey).toBeNull();
  });

  it("passes a real key through", async () => {
    const result = await load({ COVERS_CONTACT: "dev@example.org", GOOGLE_BOOKS_API_KEY: "abc123" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.googleBooksApiKey).toBe("abc123");
  });

  it("does not put the key in its error messages when the contact is bad", async () => {
    const result = await load({ COVERS_CONTACT: "nope", GOOGLE_BOOKS_API_KEY: "SECRET-KEY-VALUE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.errors)).not.toContain("SECRET-KEY-VALUE");
  });
});
