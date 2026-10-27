// Turns a downloaded or hand-made picture into the output file (docs/specs/book-cover-fetcher.md, "Image rules").
// Every source, and manual/, goes through this one function.
import { Buffer } from "node:buffer";
import sharp from "sharp";

export type Size = { width: number; height: number };
export type RejectReason = "bad-ratio" | "too-small" | "not-an-image";
export type NormalizeResult =
  | { ok: true; png: Buffer; originalSize: Size; outputSize: Size; cropped: boolean }
  | { ok: false; reason: RejectReason };

export const MIN_WIDTH = 400;
export const MAX_WIDTH = 800;

// Formats we accept as input. SVG and other formats are never decoded.
const INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_INPUT_PIXELS = 100_000_000;

const rejected = (reason: RejectReason): NormalizeResult => ({ ok: false, reason });

/** Width/height within ±8% of 2/3: 0.6133 to 0.7200. Integer arithmetic keeps the edges exact. */
const ratioIsCoverShaped = ({ width, height }: Size) => width * 10_000 >= 6133 * height && width * 100 <= 72 * height;

export async function normalizeCover(input: Buffer): Promise<NormalizeResult> {
  if (input.length === 0) return rejected("not-an-image");

  let pixels: Buffer;
  let source: Size;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !INPUT_FORMATS.has(meta.format)) return rejected("not-an-image");

    // Apply the EXIF orientation first, flatten transparency onto white and decode to plain 8-bit sRGB.
    const decoded = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .removeAlpha()
      .raw({ depth: "uchar" })
      .toBuffer({ resolveWithObject: true });
    pixels = decoded.data;
    source = { width: decoded.info.width, height: decoded.info.height };
    if (decoded.info.channels !== 3) return rejected("not-an-image");
  } catch {
    return rejected("not-an-image");
  }

  if (!ratioIsCoverShaped(source)) return rejected("bad-ratio");

  // The largest 2k × 3k box that fits, cut around the centre.
  const k = Math.floor(Math.min(source.width / 2, source.height / 3));
  const box: Size = { width: 2 * k, height: 3 * k };
  if (box.width < MIN_WIDTH) return rejected("too-small");

  const outputSize: Size = k > MAX_WIDTH / 2 ? { width: MAX_WIDTH, height: (MAX_WIDTH * 3) / 2 } : box;
  const left = Math.floor((source.width - box.width) / 2);
  const top = Math.floor((source.height - box.height) / 2);

  try {
    let pipeline = sharp(pixels, { raw: { width: source.width, height: source.height, channels: 3 } }).extract({
      left,
      top,
      width: box.width,
      height: box.height,
    });
    if (outputSize.width !== box.width) pipeline = pipeline.resize(outputSize.width, outputSize.height, { kernel: "lanczos3", fit: "fill" });
    // No metadata is kept: sharp drops it unless asked.
    const png = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    return { ok: true, png, originalSize: source, outputSize, cropped: box.width !== source.width || box.height !== source.height };
  } catch {
    return rejected("not-an-image");
  }
}
