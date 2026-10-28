// Makes the served open-book image (docs/specs/book-detail-open-book.md, "Asset") from docs/scenes/book.png.
// Not part of the build. Run only when the master changes:  npm run assets:book
// Crops to the book's outer edge (dropping any stray pixels outside it), then writes lossless WebP with alpha
// at the widths in OPEN_BOOK. The crop box below must match OPEN_BOOK.size (checked).
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OPEN_BOOK } from "../src/components/book/openBook.ts";

const MASTER = path.resolve("docs", "scenes", "book.png");
const CROP = { left: 447, top: 171, width: 1883, height: 1268 };
const OUT_DIR = path.resolve("public", "book");

if (CROP.width !== OPEN_BOOK.size.width || CROP.height !== OPEN_BOOK.size.height) {
  throw new Error("CROP does not match OPEN_BOOK.size");
}

mkdirSync(OUT_DIR, { recursive: true });
const cropped = await sharp(MASTER).ensureAlpha().extract(CROP).png().toBuffer();
for (const width of OPEN_BOOK.widths) {
  const file = path.join(OUT_DIR, `${path.basename(OPEN_BOOK.basePath)}-${width}.webp`);
  await sharp(cropped).resize({ width, kernel: "lanczos3" }).webp({ lossless: true, alphaQuality: 100 }).toFile(file);
  console.log(`wrote ${file}`);
}
