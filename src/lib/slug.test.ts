// Spec: docs/specs/book-cover-fetcher.md, criterion 4 (the shared slug function).
// The existing `unit` Vitest project already runs src/**/*.test.ts, so this one needs no config change.
import { describe, expect, it } from "vitest";

const loadSlugify = async () => (await import("./slug")).slugify;

describe("#4 slugify (src/lib/slug.ts)", () => {
  it.each([
    ["The Hobbit", "the-hobbit"],
    ["Fahrenheit 451", "fahrenheit-451"],
    ["1984", "1984"],
    ["Les Misérables", "les-miserables"],
    ["Brontë Parsonage: A Guide", "bronte-parsonage-a-guide"],
    ["Jane Eyre", "jane-eyre"],
    ["Good Omens", "good-omens"],
    ["  --Hello,   World!!  ", "hello-world"],
    ["Foo & Bar", "foo-bar"],
    ["A  B\t\tC", "a-b-c"],
  ])("turns %j into %j", async (title, slug) => {
    const slugify = await loadSlugify();
    expect(slugify(title)).toBe(slug);
  });

  it("returns an empty string for a title with no letters or digits", async () => {
    const slugify = await loadSlugify();
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  it("never starts or ends with a dash and never has a double dash", async () => {
    const slugify = await loadSlugify();
    for (const title of ["-x-", "x--y", "...x...y...", "(The) [Hobbit]"]) {
      const slug = slugify(title);
      expect(slug, title).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
