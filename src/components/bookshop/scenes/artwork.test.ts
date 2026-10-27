// Spec: docs/specs/multiple-bookshop-scenes.md — criterion #6 (artwork files, every scene).
// Module path assumed as in scenes.test.ts. Red until the registry and the generated files exist.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { masterSize, webpImage } from "../../../../tests/support/image-headers";
import { SCENES } from "./index";

const root = process.cwd();
const scenes = [...SCENES];

const servedFile = (id: string, version: string, width: number) =>
  path.join(root, "public", "bookshop", `${id}@${version}-${width}.webp`);

describe.each(scenes.map((s) => [s.id, s] as const))("#6 artwork of scene %s", (_id, scene) => {
  const { master, size, version, widths } = scene.artwork;
  const masterPath = path.join(root, master);

  it("has a master image in the repository", () => {
    expect(existsSync(masterPath), masterPath).toBe(true);
  });

  it("has a master whose header size equals artwork.size and whose width is at least 1920", () => {
    expect(masterSize(masterPath)).toEqual(size);
    expect(size.width).toBeGreaterThanOrEqual(1920);
  });

  it("lists widths at 50%, 75% and 100% of the master width, rounded", () => {
    expect([...widths]).toEqual([Math.round(size.width * 0.5), Math.round(size.width * 0.75), size.width]);
  });

  describe.each([...widths])("%ipx file", (width) => {
    const file = servedFile(scene.id, version, width);
    const height = Math.round((size.height * width) / size.width);

    it(`is committed as public/bookshop/${scene.id}@${version}-${width}.webp`, () => {
      expect(existsSync(file), file).toBe(true);
    });

    it("is a lossless (VP8L) WebP", () => {
      expect(webpImage(readFileSync(file)).codec).toBe("VP8L");
    });

    it(`is exactly ${width}×${height}, the size the master's aspect ratio implies`, () => {
      const { width: w, height: h } = webpImage(readFileSync(file));
      expect({ width: w, height: h }).toEqual({ width, height });
    });
  });
});
