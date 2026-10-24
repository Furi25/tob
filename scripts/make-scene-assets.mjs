// One-off: makes the served bookshop artwork from the master (docs/specs/bookshop-display.md, "Assets").
// Not part of the build. Run with `npm run assets:scene` only when the master or ARTWORK_VERSION changes.
//
// - Downscales with an exact area-averaging (box) filter, implemented here so the result does not
//   depend on an image library's resampling kernel.
// - Saves every size as lossless WebP via sharp. Drops alpha when the master is fully opaque.
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const VERSION = "v1";
const MASTER = path.resolve("docs", "bookstore display.png");
const OUT_DIR = path.resolve("public", "bookshop");
const WIDTHS = [1376, 2064, 2752];

/** Box-filters one axis: each output sample averages the input samples it covers, weighted by overlap. */
function resampleAxis(src, srcLen, dstLen, otherLen, channels, horizontal) {
  const dst = new Float32Array(dstLen * otherLen * channels);
  const scale = srcLen / dstLen;
  for (let o = 0; o < dstLen; o++) {
    const start = o * scale;
    const end = start + scale;
    const first = Math.floor(start);
    const last = Math.min(srcLen - 1, Math.ceil(end) - 1);
    for (let k = 0; k < otherLen; k++) {
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let i = first; i <= last; i++) {
          const weight = Math.min(end, i + 1) - Math.max(start, i);
          const index = horizontal ? (k * srcLen + i) * channels + c : (i * otherLen + k) * channels + c;
          sum += src[index] * weight;
        }
        const out = horizontal ? (k * dstLen + o) * channels + c : (o * otherLen + k) * channels + c;
        dst[out] = sum / scale;
      }
    }
  }
  return dst;
}

const { data, info } = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
let opaque = true;
for (let i = 3; i < data.length; i += 4) {
  if (data[i] !== 255) {
    opaque = false;
    break;
  }
}
const channels = opaque ? 3 : 4;
const pixels = new Float32Array(width * height * channels);
for (let p = 0, q = 0; p < data.length; p += 4) {
  for (let c = 0; c < channels; c++) pixels[q++] = data[p + c];
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(`master ${width}×${height}, ${opaque ? "opaque (alpha dropped)" : "has transparency (alpha kept)"}`);

for (const outWidth of WIDTHS) {
  const outHeight = Math.round((height * outWidth) / width);
  let result = pixels;
  if (outWidth !== width) {
    const horizontal = resampleAxis(pixels, width, outWidth, height, channels, true);
    result = resampleAxis(horizontal, height, outHeight, outWidth, channels, false);
  }
  const bytes = Buffer.alloc(result.length);
  for (let i = 0; i < result.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(result[i])));

  const file = path.join(OUT_DIR, `scene@${VERSION}-${outWidth}.webp`);
  await sharp(bytes, { raw: { width: outWidth, height: outHeight, channels } })
    .webp({ lossless: true, effort: 6 })
    .toFile(file);
  console.log(`${path.relative(process.cwd(), file)}  ${outWidth}×${outHeight}  ${(statSync(file).size / 1e6).toFixed(2)} MB`);
}
