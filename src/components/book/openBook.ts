/** The shared open-book window image and where the text sits on it (docs/specs/book-detail-open-book.md). */
export const OPEN_BOOK = {
  basePath: "/book/open-book@v1",
  widths: [1376, 2064, 2752],
  // The master cropped to the book's outer edge (scripts/make-book-asset.mjs).
  size: { width: 1883, height: 1268 },
  // Percent of the cropped image. Kept clear of the page stains, the page edges and the spine shadow.
  pages: {
    left: { left: 6.4, top: 6, width: 37.6, height: 80 },
    right: { left: 55, top: 6, width: 37.5, height: 80 },
  },
} as const;

export const openBookPath = (width: number) => `${OPEN_BOOK.basePath}-${width}.webp`;
