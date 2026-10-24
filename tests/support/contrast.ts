// WCAG 2.x relative luminance and contrast ratio, written independently of the app
// so tests do not trust the implementation's own readability check.

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** The string Chromium's getComputedStyle uses for an opaque colour. */
export function hexToCss(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(hexToRgb(a)), relativeLuminance(hexToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type PaletteInput = { primary: string; surface: string; text: string; highlight: string };

/** The readability rule from docs/specs/book-detail-page.md → Data Model. */
export function isReadable(p: PaletteInput): boolean {
  return (
    contrastRatio(p.text, p.surface) >= 4.5 &&
    contrastRatio(p.highlight, p.surface) >= 4.5 &&
    contrastRatio(p.surface, p.primary) >= 3
  );
}
