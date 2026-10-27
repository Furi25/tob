// Makes the served artwork of the scenes from their masters (docs/specs/multiple-bookshop-scenes.md, "Artwork files").
// Not part of the build. Run only when a master or its artwork.version changes:
//   npm run assets:scene -- <scene-id>   writes only that scene's files
//   npm run assets:scene                 writes every scene's files
// The id, master path, version and widths come from the registry in src/components/bookshop/scenes.
//
// - Downscales with an exact area-averaging (box) filter, implemented here so the result does not
//   depend on an image library's resampling kernel.
// - Saves every size as lossless WebP via sharp. Drops alpha when the master is fully opaque.
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SCENES } from "../src/components/bookshop/scenes/index.ts";

const OUT_DIR = path.resolve("public", "bookshop");

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

async function makeAssets(scene) {
  const { version, widths, master } = scene.artwork;
  const { data, info } = await sharp(path.resolve(master)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (width !== scene.artwork.size.width || height !== scene.artwork.size.height) {
    throw new Error(
      `${scene.id}: ${master} is ${width}×${height} but artwork.size says ${scene.artwork.size.width}×${scene.artwork.size.height}`,
    );
  }
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
  console.log(`${scene.id}: master ${width}×${height}, ${opaque ? "opaque (alpha dropped)" : "has transparency (alpha kept)"}`);

  for (const outWidth of widths) {
    const outHeight = Math.round((height * outWidth) / width);
    let result = pixels;
    if (outWidth !== width) {
      const horizontal = resampleAxis(pixels, width, outWidth, height, channels, true);
      result = resampleAxis(horizontal, height, outHeight, outWidth, channels, false);
    }
    const bytes = Buffer.alloc(result.length);
    for (let i = 0; i < result.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(result[i])));

    const file = path.join(OUT_DIR, `${scene.id}@${version}-${outWidth}.webp`);
    await sharp(bytes, { raw: { width: outWidth, height: outHeight, channels } })
      .webp({ lossless: true, effort: 6 })
      .toFile(file);
    console.log(`${path.relative(process.cwd(), file)}  ${outWidth}×${outHeight}  ${(statSync(file).size / 1e6).toFixed(2)} MB`);
  }
}

const requested = process.argv[2];
const scenes = requested === undefined ? SCENES : SCENES.filter((scene) => scene.id === requested);
if (scenes.length === 0) {
  console.error(`Unknown scene "${requested}". Known scenes: ${SCENES.map((scene) => scene.id).join(", ")}`);
  process.exit(1);
}
for (const scene of scenes) await makeAssets(scene);
