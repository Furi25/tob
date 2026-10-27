// Test-only image header readers. They read the bytes themselves, so a wrong export cannot hide a wrong file.
import { readFileSync } from "node:fs";

export type ImageSize = { width: number; height: number };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngSize(buf: Buffer): ImageSize {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG file");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Reads the first start-of-frame marker of a JPEG. */
export function jpegSize(buf: Buffer): ImageSize {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a JPEG file");
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  throw new Error("JPEG has no start-of-frame marker");
}

/** PNG or JPEG, decided by the signature, not by the file extension. */
export function masterSize(file: string): ImageSize {
  const buf = readFileSync(file);
  return buf[0] === 0xff ? jpegSize(buf) : pngSize(buf);
}

export type WebpImage = { codec: "VP8L" | "VP8 "; width: number; height: number };

/** Walks the RIFF chunks and reads the first image bitstream header. VP8L = lossless, "VP8 " = lossy. */
export function webpImage(buf: Buffer): WebpImage {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a WebP file");
  }
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const fourcc = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (fourcc === "VP8L") {
      if (buf[data] !== 0x2f) throw new Error("bad VP8L signature");
      const bits = buf.readUInt32LE(data + 1);
      return { codec: "VP8L", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (fourcc === "VP8 ") {
      return { codec: "VP8 ", width: buf.readUInt16LE(data + 6) & 0x3fff, height: buf.readUInt16LE(data + 8) & 0x3fff };
    }
    offset = data + size + (size & 1);
  }
  throw new Error("WebP file has no VP8L or VP8 image chunk");
}
