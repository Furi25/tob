import "server-only";
import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Book detail data for /books/[slug] (docs/specs/book-detail-page.md).

/** The [slug] route param: lowercase kebab-case, at most 100 characters. */
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type Palette = { primary: string; surface: string; text: string; highlight: string };

/** Darkest paper tone under the text areas of the open-book image (the contrast baseline for ink and accents). */
export const PARCHMENT = "#ddbc8b";

/** Dark ink on the parchment; `primary`/`surface` colour the cover plate and the buy button. */
export const DEFAULT_PALETTE: Palette = {
  primary: "#7a2e0a",
  surface: "#fff6dc",
  text: "#3a2410",
  highlight: "#7a2e0a",
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const paletteSchema = z.object({ primary: hex, surface: hex, text: hex, highlight: hex }).strict();
const coverPathSchema = z.string().regex(/^\/covers\/[a-z0-9-]+\.(webp|png|jpg)$/);
const buyUrlSchema = z.url({ protocol: /^https$/ });

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(color.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function isReadable(p: Palette): boolean {
  return (
    contrast(p.text, PARCHMENT) >= 4.5 && contrast(p.highlight, PARCHMENT) >= 4.5 && contrast(p.surface, p.primary) >= 4.5
  );
}

function toPalette(value: unknown): Palette {
  const parsed = paletteSchema.safeParse(value);
  return parsed.success && isReadable(parsed.data) ? parsed.data : DEFAULT_PALETTE;
}

export type BookDetail = {
  slug: string;
  title: string;
  author: string;
  tagline: string;
  summary: string;
  about: string;
  whyPopular: string;
  whyItMatters: string;
  authorBio: string | null;
  buyUrl: string | null;
  coverImage: string | null;
  palette: Palette;
};

/** One book by slug, with stored URLs and palette validated. Null when no book has this slug. */
export const getBookBySlug = cache(async (slug: string): Promise<BookDetail | null> => {
  const row = await prisma.book.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      author: true,
      tagline: true,
      summary: true,
      about: true,
      whyPopular: true,
      whyItMatters: true,
      authorBio: true,
      affiliateUrl: true,
      coverImage: true,
      palette: true,
    },
  });
  if (!row) return null;
  const { affiliateUrl, coverImage, palette, ...text } = row;
  const buyUrl = buyUrlSchema.safeParse(affiliateUrl);
  const cover = coverPathSchema.safeParse(coverImage);
  return {
    ...text,
    buyUrl: buyUrl.success ? buyUrl.data : null,
    coverImage: cover.success ? cover.data : null,
    palette: toPalette(palette),
  };
});
