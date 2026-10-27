// Spec: docs/specs/book-cover-fetcher.md, criteria 11–18 (image rules). See tests/support/covers.ts for the assumed
// normalizeCover signature. Every input is made with sharp; no binary fixtures.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  BAND,
  bandedPng,
  BLUE,
  cropBox,
  jpeg,
  pixelAt,
  png,
  RED,
} from "../../tests/support/covers";

const normalize = async (input: Buffer) => (await import("./image")).normalizeCover(input);

async function accepted(input: Buffer) {
  const result = await normalize(input);
  if (!result.ok) throw new Error(`expected the image to be accepted, got ${result.reason}`);
  return result;
}

async function rejection(input: Buffer) {
  const result = await normalize(input);
  return result.ok ? "accepted" : result.reason;
}

/** Colour distance that tolerates JPEG compression noise. */
const near = (actual: readonly number[], expected: readonly number[], tolerance = 40) =>
  actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);

/** Deterministic noise, so a truncated file really is missing data (a flat colour compresses to almost nothing). */
function noisePng(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3);
  let state = 123456789;
  for (let i = 0; i < raw.length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    raw[i] = state >>> 24;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
}

describe("#11 a source close to 2:3 becomes exactly 2:3, cropped around the centre", () => {
  it.each([620, 650, 667, 700, 720])("a source 1000 px tall and %i px wide", async (width) => {
    const result = await accepted(await jpeg(width, 1000));
    const expected = cropBox(width, 1000);
    expect(result.outputSize).toEqual(expected);
    expect(result.originalSize).toEqual({ width, height: 1000 });
    expect(result.cropped).toBe(true);
    expect(expected.height * 2).toBe(expected.width * 3);

    const meta = await sharp(result.png).metadata();
    expect(meta.format).toBe("png");
    expect({ width: meta.width, height: meta.height }).toEqual(expected);
    // decodes all the way through
    await expect(sharp(result.png).raw().toBuffer()).resolves.toBeInstanceOf(Buffer);
  });

  it("trims the sides equally when the source is too wide (red on the left edge, blue on the right edge survive)", async () => {
    const result = await accepted(await bandedPng(720, 1000, "x"));
    const { width, height } = result.outputSize;
    expect(await pixelAt(result.png, 0, Math.floor(height / 2))).toEqual(RED);
    expect(await pixelAt(result.png, width - 1, Math.floor(height / 2))).toEqual(BLUE);
    // the band was 40 px; 27 px were trimmed on each side, so about 13 px of it is left
    expect(await pixelAt(result.png, 5, 0)).toEqual(RED);
    expect(await pixelAt(result.png, width - 6, 0)).toEqual(BLUE);
  });

  it("trims the top and bottom equally when the source is too narrow (red on the top edge, blue on the bottom edge survive)", async () => {
    const result = await accepted(await bandedPng(620, 1000, "y"));
    const { width, height } = result.outputSize;
    expect(await pixelAt(result.png, Math.floor(width / 2), 0)).toEqual(RED);
    expect(await pixelAt(result.png, Math.floor(width / 2), height - 1)).toEqual(BLUE);
    expect(BAND).toBeGreaterThan(35); // 35 px are trimmed on each side, so some of the band is left
  });

  it("does not stretch: the 40 px red band keeps its thickness", async () => {
    const result = await accepted(await bandedPng(700, 1000, "y"));
    const { width, height } = result.outputSize;
    const { data, info } = await sharp(result.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const x = Math.floor(width / 2);
    let redRows = 0;
    for (let y = 0; y < height; y++) {
      const at = (y * info.width + x) * info.channels;
      if (data[at] === 255 && data[at + 1] === 0 && data[at + 2] === 0) redRows++;
    }
    // 1 row of the 1000 is trimmed in total (k = 333 → 999 rows), so the band loses at most that one
    expect(redRows).toBeGreaterThanOrEqual(BAND - 1);
    expect(redRows).toBeLessThanOrEqual(BAND);
  });
});

describe("#12 the ±8% tolerance", () => {
  it.each([615, 719])("accepts a ratio of 0.%i (just inside)", async (width) => {
    expect(await rejection(await jpeg(width, 1000))).toBe("accepted");
  });

  it.each([612, 721, 600, 750, 1000, 1780])("rejects a ratio of %i/1000 as bad-ratio", async (width) => {
    expect(await rejection(await jpeg(width, 1000))).toBe("bad-ratio");
  });
});

describe("#13 the minimum size", () => {
  it("accepts a source of exactly 250×375", async () => {
    const result = await accepted(await jpeg(250, 375));
    expect(result.outputSize).toEqual({ width: 250, height: 375 });
  });

  it.each([
    [300, 450],
    [380, 570],
    [399, 600],
  ])("accepts a %i×%i source, which was too small before the minimum became 250", async (width, height) => {
    const result = await accepted(await jpeg(width, height));
    expect(result.outputSize).toEqual({ width, height });
  });

  it.each([
    [248, 372],
    [249, 375],
    [240, 360],
    [200, 300],
  ])("rejects a %i×%i source as too-small", async (width, height) => {
    expect(await rejection(await jpeg(width, height))).toBe("too-small");
  });

  it("rejects a source whose crop falls under 250 px wide even if the source is tall enough", async () => {
    // 249×390: ratio 0.6385 is inside the window, k = floor(min(124.5, 130)) = 124, so the output would be 248 wide
    expect(await rejection(await jpeg(249, 390))).toBe("too-small");
  });

  it("accepts a source that crops to exactly 250 px wide even if it is a little larger", async () => {
    // 251×376: k = floor(min(125.5, 125.33)) = 125, so the crop is 250×375
    const result = await accepted(await jpeg(251, 376));
    expect(result.outputSize).toEqual({ width: 250, height: 375 });
  });
});

describe("#14 scaling down, never up", () => {
  it("turns 2000×3000 into 800×1200", async () => {
    expect((await accepted(await png(2000, 3000))).outputSize).toEqual({ width: 800, height: 1200 });
  });

  it("turns a source that crops to more than 800 px wide into 800×1200", async () => {
    // 2000×2900: ratio 0.69, k = 966, crop 1932×2898, then scaled to 800×1200
    expect((await accepted(await png(2000, 2900))).outputSize).toEqual({ width: 800, height: 1200 });
    expect((await accepted(await png(810, 1215))).outputSize).toEqual({ width: 800, height: 1200 });
  });

  it.each([
    [250, 375],
    [500, 750],
    [600, 900],
    [400, 600],
    [800, 1200],
  ])("leaves a %i×%i source at its size", async (width, height) => {
    expect((await accepted(await png(width, height))).outputSize).toEqual({ width, height });
  });

  it("never gives a result bigger than 800×1200 or smaller than 250×375", async () => {
    for (const [w, h] of [
      [2400, 3600],
      [1500, 2200],
      [420, 640],
      [260, 390],
    ]) {
      const { outputSize } = await accepted(await png(w, h));
      expect(outputSize.width).toBeLessThanOrEqual(800);
      expect(outputSize.height).toBeLessThanOrEqual(1200);
      expect(outputSize.width).toBeGreaterThanOrEqual(250);
      expect(outputSize.height).toBeGreaterThanOrEqual(375);
      expect(outputSize.height * 2).toBe(outputSize.width * 3);
    }
  });
});

describe("#15 things that are not images", () => {
  const html = Buffer.from("<!doctype html><html><body>Not Found</body></html>");

  it.each([
    ["HTML text", () => Promise.resolve(html)],
    ["a zero-byte buffer", () => Promise.resolve(Buffer.alloc(0))],
    ["a plain text file", () => Promise.resolve(Buffer.from("hello"))],
    ["random bytes", () => Promise.resolve(Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 31 + 7) % 256)))],
    ["a truncated PNG", async () => (await noisePng(650, 1000)).subarray(0, 40_000)],
    ["a truncated JPEG", async () => (await sharp(await noisePng(650, 1000)).jpeg().toBuffer()).subarray(0, 8_000)],
  ])("gives not-an-image for %s and does not throw", async (_label, make) => {
    const input = await make();
    await expect(normalize(input)).resolves.toEqual({ ok: false, reason: "not-an-image" });
  });
});

describe("#16 the conversion is deterministic", () => {
  it.each([
    ["a cropped JPEG", () => jpeg(650, 1000)],
    ["a scaled PNG", () => png(2000, 3000)],
    ["an exact-size PNG", () => png(500, 750)],
  ])("gives the same bytes twice for %s", async (_label, make) => {
    const input = await make();
    const first = await accepted(input);
    const second = await accepted(Buffer.from(input));
    expect(first.png.equals(second.png)).toBe(true);
  });
});

describe("#17 EXIF orientation", () => {
  it("judges and cuts by how the picture is displayed: a stored 1000×650 with orientation 6 is displayed 650×1000", async () => {
    const stored = await sharp(await bandedPng(1000, 650, "x")).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(stored).metadata()).orientation).toBe(6); // the probe really carries the tag

    const result = await accepted(stored);
    expect(result.outputSize).toEqual({ width: 650, height: 975 });
    // rotated a quarter turn clockwise, the stored left edge (red) is on top and the right edge (blue) at the bottom
    expect(near(await pixelAt(result.png, 325, 0), RED)).toBe(true);
    expect(near(await pixelAt(result.png, 325, 974), BLUE)).toBe(true);
  });

  it("does not rotate a picture that has no orientation tag", async () => {
    const result = await accepted(await bandedPng(650, 1000, "y"));
    expect(await pixelAt(result.png, 325, 0)).toEqual(RED);
  });

  it("rejects a stored 650×1000 whose orientation 6 makes it display as 1000×650", async () => {
    const stored = await sharp(await jpeg(650, 1000)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect(await rejection(stored)).toBe("bad-ratio");
  });
});

describe("#18 flat, sRGB, no alpha, no metadata", () => {
  async function transparentOverBlue() {
    // left half opaque blue, right half fully transparent
    const width = 650;
    const height = 1000;
    const raw = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) raw.set(x < width / 2 ? [0, 0, 255, 255] : [255, 0, 0, 0], (y * width + x) * 4);
    return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  }

  it("flattens transparency onto white and removes the alpha channel", async () => {
    const input = await transparentOverBlue();
    expect((await sharp(input).metadata()).hasAlpha).toBe(true);

    const result = await accepted(input);
    const meta = await sharp(result.png).metadata();
    expect(meta.hasAlpha).toBe(false);
    expect(meta.channels).toBe(3);
    expect(meta.space).toBe("srgb");
    expect(await pixelAt(result.png, 100, 400)).toEqual(BLUE);
    expect(await pixelAt(result.png, 500, 400)).toEqual([255, 255, 255]);
  });

  it("carries no EXIF, ICC or XMP data even when the source had it", async () => {
    const withMetadata = await sharp(await jpeg(650, 1000))
      .withMetadata({ exif: { IFD0: { Copyright: "Somebody", Artist: "Somebody Else" } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withMetadata).metadata()).exif).toBeDefined();

    const result = await accepted(withMetadata);
    const meta = await sharp(result.png).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(result.png.includes(Buffer.from("Somebody"))).toBe(false);
    expect(result.png.includes(Buffer.from("eXIf"))).toBe(false);
  });

  it("writes a PNG", async () => {
    const result = await accepted(await jpeg(650, 1000));
    expect([...result.png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
