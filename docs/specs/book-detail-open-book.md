# Book Detail Page: Open Book Window

> The 1920px stage cap in this spec was removed; see [bookshop-scene-scaling.md](bookshop-scene-scaling.md).

## Goal

The book detail page at `/books/[slug]` becomes a single non-scrolling view: an open old book, centred over the still-visible bookshop. The left page holds the cover, title, author, tagline and buy button. The right page holds the editorial text, and that text, and only that text, scrolls inside the page. Section headings are redesigned as chapter headings. Every book uses the same book image, and a book can change only a few colours. The structure leaves room for fuller per-book styles and pixel animations later.

This is a visual redesign of [book-detail-page.md](book-detail-page.md). Content, data loading, routing, metadata, 404 and buy-link rules stay as specified there. The layout, palette and accessibility rules below replace the parts that conflict (see **Supersedes**).

Reference mockup (throwaway, not to be copied): `mockups/book-asset.html`, `book-asset.css`, `book-asset.js`. `mockups/book-open.html` is an earlier variant without the asset.

## Scope

**In scope**
- New page frame: backdrop, centred book window, the left and right pages, a text pane that scrolls.
- **One shared book image** (`docs/scenes/book.png`, cleaned)
- Chapter-style section headings, drop cap, running header.
- Palette mapping: the existing four colours are reinterpreted for the parchment look.
- Small-screen and short-window fallback.
- CSS-only entrance animation and cover sparkles, all disabled under `prefers-reduced-motion`.
- A stable hook for later effects and per-book styles (see **Extension points**).
- The 404 page for unknown slugs, in the same window.

**Out of scope**
- Per-book image variants or filter-based tinting of the image.
- Per-book fonts, ornaments or layouts.
- The drifting-dust canvas and any other JavaScript animation (not part of this spec).
- Page-turn between sections, modal or intercepting-route presentation.
- Any change to the shop scene, hotspots or the `/` page.
- Real affiliate links (unchanged: "Buying links are coming soon." until set).

## Data Model

No schema change and no migration.

`Book.palette` keeps its JSON shape `{ primary, surface, text, highlight }`, all `#rrggbb`, with the same strict validation (`paletteSchema`) and the same fallback to `DEFAULT_PALETTE`. The seed sets no palette, so every book currently uses the default and no stored data needs converting.

The fields get new roles, because the paper is now part of the image and cannot change colour:

| Field | Old role | New role |
|-------|----------|----------|
| `text` | text on the panel | ink: body text, title, byline, running header on the parchment |
| `highlight` | links and accents on the panel | accent on the parchment: chapter labels, drop cap, divider, tagline, focus outline |
| `primary` | panel border, cover cloth | cover plate fill (placeholder cover) and buy button fill |
| `surface` | panel background | lettering colour on `primary`: placeholder cover text and buy button text |

`DEFAULT_PALETTE` changes from the dark wood palette to a parchment palette. Proposed values, to be confirmed against the final asset: `text #3a2410`, `highlight #8a3f0c`, `primary #8a3f0c`, `surface #fff6dc`.

New constant in `src/server/books.ts` (or a shared module):

```ts
/** Darkest paper tone under the text areas of the shipped asset; the contrast baseline. */
export const PARCHMENT = "#........"; // measured from the cleaned asset, not guessed
```

New readability rule, replacing `isReadable`:
- `contrast(text, PARCHMENT) >= 4.5`
- `contrast(highlight, PARCHMENT) >= 4.5`
- `contrast(surface, primary) >= 4.5` (lettering on cover and button)

The old rule checked `text` and `highlight` against `surface` and had a 3:1 check for `primary`. A palette stored under the old rule is typically light text, which now fails and falls back to the default. This is safe and needs no cleanup.

**Not a breaking schema change.** It is a behavioural change to the meaning of `palette` and to `DEFAULT_PALETTE`. Flagged below under Breaking Changes.

## API Contracts

No new Server Actions or route handlers.

`getBookBySlug(slug)` keeps its signature and `BookDetail` type. Only `toPalette`, `isReadable` and `DEFAULT_PALETTE` change as described above. `slugSchema`, `buyUrlSchema` and `coverPathSchema` are unchanged.

`generateMetadata`, `dynamic = "force-dynamic"`, 404 status and the error page behave as in book-detail-page.md.

Asset helper, alongside the scene artwork helpers (same naming style as `artworkPath` for `public/bookshop/`):

```ts
export const OPEN_BOOK = {
  basePath: "/book/open-book@v1",          // -> `${basePath}-${width}.webp`
  widths: [1376, 2064, 2752],
  size: { width: number, height: number },  // of the cleaned, cropped asset
  pages: {                                  // % of the asset's width/height
    left:  { left: number, top: number, width: number, height: number },
    right: { left: number, top: number, width: number, height: number },
  },
} as const;
```

The numbers are measured from the final asset (see **Asset**).

## Asset

- **Source of truth:** `docs/scenes/book.png`, the cleaned file that replaces `bookbg.png` (which had a checkerboard painted into its pixels). It has real transparency, and the old `bookbg.png` and its keying workaround are no longer needed.
- **Known defect:** the file has a small stray light-grey square near the bottom edge (about 38% across, below the book). It lies outside the book, so cropping to the book's bounds removes it. The implementer must check that nothing opaque is left outside the book after the crop.
- **Shipped file:** true-alpha WebP, lossless or near-lossless (pixel art; lossy compression blurs it). Cropped to the book's outer edge, with no margin. Served from `public/book/open-book@v1-<width>.webp` at the same set of widths and the same `srcset` approach as `public/bookshop/`. Optimised sizes are produced the same way as the shop images.
- **Aspect ratio:** about 1367:920 (roughly 1.49:1) from a visual estimate of `book.png`. Take the exact value from the cropped file and record it in `OPEN_BOOK.size`. The mockup's 960:648 was a CSS crop of the old image and is not final.
- **Text areas:** these are estimates for the cropped book, measured by eye on `book.png` and kept clear of the stains, the page edges and the spine shadow: left page about 6.2% from the left, 5.4% from the top, 40.2% wide, 82.6% high; right page about 52.3% from the left, 5.4% from the top, 41.0% wide, 82.6% high. They must be measured exactly on the cropped file and recorded in `OPEN_BOOK.pages`.
- **Remove:** the SVG colour-keying filter, the CSS crop offsets and the `--tint` filter. They exist only because of the baked-in checkerboard and per-book tint.
- **Rendering:** `<img>` with `srcSet`, as `BookshopScene` does (`next/image` cannot serve a pre-made srcset), decorative (`alt=""`). `image-rendering` is smooth, as in the shop scene.
- **Shadow:** a CSS `drop-shadow` on the image follows its alpha outline.
- A unit test checks that every width file exists, has an alpha channel, and has the ratio in `OPEN_BOOK.size`.

## UI Surface

Route `/books/[slug]` and `not-found.tsx`, both through a reworked `BookShell`. Server Components throughout, with no client component in this spec.

### Page frame (`BookShell`)
- Full viewport, `overflow: hidden` on the page (`html`/`body` or the shell, with no document scroll). The window is centred both ways.
- Backdrop: the shop artwork stays visible. The dark scrim drops from today's 0.8 to a light vignette (about 0.1 at the centre to 0.4 at the edges). It uses the 2064px shop file, not the smallest, so the shop is sharp. Backdrop scene stays the default scene, as today.
- Breadcrumb or back link: a real link to `/`, text "Back to the shop", top left, on a solid chip so it stays readable on the artwork. It is the first Tab stop (existing criterion 22).

### Window
- Width is the largest value that keeps the asset's aspect ratio inside the viewport minus the chrome (the top and bottom reserved for the back link and a bottom margin): `min(100%, (100dvh - chrome) * ratio)`, with a `100vh` fallback and a `max-width` cap.
- The window is a size container (`container-type: size`). All font sizes, spacing and page boxes are in container units (`cqw`, with `clamp()` bounds), so text scales with the book.
- The two page boxes are absolutely positioned at `OPEN_BOOK.pages`.

### Left page
In order: cover, title (`<h1>`), byline, tagline, buy block.
- Cover: the existing `BookCover` behaviour (real `coverImage` in a 2:3 frame with alt "Cover of {title}", else the lettered placeholder, `aria-hidden`). The placeholder uses `primary` and `surface`. The cover takes the free height (`flex: 1; min-height: 0`) so it shrinks first.
- Title: `overflow-wrap: anywhere`; a 100-character title wraps and never overflows the page box.
- Tagline: omitted (no element) when empty, as today. Flourish glyphs are decorative (`aria-hidden` via CSS `content`).
- Buy block: unchanged logic and wording. Valid https URL gives "Buy {title}" with `rel="sponsored"` and the disclosure sentence. Otherwise "Buying links are coming soon." with no link.

### Right page
- Running header: "{title} · {author}", decorative, `aria-hidden`.
- Text pane: the only scroller. `tabindex="0"`, `role="region"`, `aria-label="About {title}"`, visible focus outline in `highlight`. Thin scrollbar in `highlight`. A soft fade at the top and bottom edges (CSS mask) as a scroll hint.
- Sections: same four sections, same order, same skip-if-empty rule, same `<h2>` per section.
- Section heading: a small label "Chapter {roman numeral}", the existing heading text in italics, and a divider with a diamond. The numeral follows the rendered order (1, 2, 3 …), so skipping a section does not leave a gap. The label is `aria-hidden`, so the heading's accessible text stays the existing heading text.
- Body text: justified with hyphenation, drop cap on the first paragraph of each section. A field may contain blank-line separated paragraphs, rendered as separate `<p>`; today's single-paragraph fields render as one `<p>`. The drop cap is pure CSS (`::first-letter`).

### Small screens and short windows
- Below 700px wide, or below 480px tall, the book image no longer scales to a readable size. In that case the image is not shown, and the page uses a single parchment-coloured panel with the old stacked order (cover, title, tagline, sections, buy). In this mode the page scrolls normally. It uses the same palette roles and heading style.
- Very wide windows are limited by height, so the book is centred with the shop visible on both sides. Wider than the `max-width` cap, the book stops growing.
- Reading is never worse than today's page at 375px.

### States
- Loading: none (no `loading.tsx`), as today.
- Empty or missing data: no tagline, no buy URL, no cover image, no `authorBio` all render cleanly. If all four sections are empty, the right page shows only the running header and an empty pane.
- Backdrop or book image fails to load: the page keeps `--wood-dark` as the background. If the book image fails, the pages stay in place on the parchment-coloured `background-color` of each page box, so content is still readable.
- Not found: the same window. The left page shows "We couldn't find that book." (`<h1>`) and the right page the existing sentence plus the link to `/`. `BookShell` and `noindex` behaviour unchanged. Uses `DEFAULT_PALETTE`.

### Animation (CSS only)
- Window entrance on load (a stepped scale-in, around 0.6s) and sparkles on the placeholder cover.
- Both are disabled under `prefers-reduced-motion: reduce`: no animation, final state shown, no transitions on hover or focus.
- Dust and other canvas effects are out of scope for this spec.

### Extension points (not built now)
- The shell root carries `data-book-style="default"` and receives all colours as `--book-*` custom properties (as today), so a later per-book style only sets more variables or a different `data-book-style` value.
- Per-book styles may later add an effects layer above the backdrop and below the window. Nothing is built or reserved in the markup for it now.
- Any future palette field must keep the `#rrggbb` validation and contrast checks.

## Acceptance Criteria

**Layout and scrolling**
1. At 1440×900, 1024×768, 1920×1080 and 1280×720, the document has no vertical or horizontal scrollbar (`scrollHeight <= innerHeight`, `scrollWidth <= innerWidth`) on every seeded book.
2. At those sizes the book window is centred (its centre is within 2px of the viewport centre), and the shop backdrop is visible on at least one side at 1920×1080.
3. The window's aspect ratio equals `OPEN_BOOK.size`, and its box lies inside the viewport at every tested size.
4. With a very long `about` text (at least 20,000 characters), the document still does not scroll, and the text pane has `scrollHeight > clientHeight` and scrolls with the mouse wheel and the keyboard.
5. With short text, the text pane does not scroll and shows no scrollbar.
6. Scrolling the text pane does not scroll the document, and does not move the left page, the title or the buy button.
7. The text of both pages stays inside their page boxes: no element's bounding box extends beyond the book image box. This includes a 100-character title and a 100-character author.

**Content (unchanged rules, new markup)**
8. Criteria 1–13 and 15–16 of book-detail-page.md still hold, except where **Supersedes** says otherwise. This includes headings, order, skip-if-empty, exactly one `<h1>`, the document title, meta description, 404 behaviour, buy-link rules and cover-path validation.
9. Each rendered section has a "Chapter" label with a roman numeral in rendered order. With the second section empty, the labels are I, II, III with no gap.
10. A field with blank-line separated paragraphs renders one `<p>` per paragraph. A single-paragraph field renders one `<p>`.
11. With `coverImage = null` the placeholder cover is `aria-hidden` and uses the `primary` and `surface` colours. With a valid `coverImage`, there is an `<img>` with alt "Cover of {title}".

**Palette**
12. With a valid, readable palette, the computed colours equal the palette values: `<h1>` colour = `text`, chapter label colour = `highlight`, buy button background = `primary`, buy button text = `surface`.
13. With `palette = null`, a missing key, an extra key, a non-hex value, a palette that fails the new rule, or an old-style dark-surface palette, the computed colours equal `DEFAULT_PALETTE`. The HTML contains none of the rejected values.
14. `DEFAULT_PALETTE` passes the new rule (unit test). The rule is unit-tested at its boundaries (4.49 and 4.5 for text and highlight, and for lettering on `primary`).
15. `PARCHMENT` is within the tolerance of the darkest sampled paper colour under the text boxes of the shipped asset (unit test over the file).

**Asset**
16. The book image requests are WebP files from `/book/`, and each has real alpha. No SVG colour filter and no CSS tint filter is applied to it.
17. Corner pixels of the shipped files are fully transparent (unit test over the file).
18. With the book image request blocked, all text is still readable and the page does not scroll.
19. With the backdrop request blocked, the page still renders and keeps its contrast.

**Accessibility**
20. The first Tab from the top focuses "Back to the shop", and it goes to `/`. The next focusable elements are the buy link (when present) and then the text pane. Every one shows a visible focus indicator.
21. The text pane has `role="region"` and an accessible name containing the title.
22. The book image is decorative (`alt=""`). The running header is `aria-hidden`.
23. axe reports no violations on `/books/{slug}` for the default palette and an accepted custom palette. Because axe cannot judge text over images, the contrast of the palette is asserted by criterion 14.
24. With `prefers-reduced-motion: reduce`, computed `animation-name` is `none` and `transition-duration` is `0s` on the window, the cover sparkles and the buy button.

**Small screens**
25. At 699×900, 375×667 and 1024×479 the book image is not shown, the content is in one column in the old order, and nothing overflows horizontally. The document can scroll vertically there.
26. At 700×900 and 1024×480 the book layout is shown and criterion 1 holds.

**Server rendering**
27. The route adds no client component. With JavaScript disabled, criteria 1, 8 and 20 still hold.

## Risks and Trade-offs

- **Contrast over a mottled image.** The paper has stains, and tools cannot measure text on it. We fix this by using one `PARCHMENT` baseline, taken from the darkest tone under the text, and by keeping the text boxes away from the worst stains. The cost is a slightly stricter rule than needed on clean paper.
- **Palette meaning changes.** Reusing the four keys avoids a migration, but their names (`surface`, `primary`) no longer describe what they do. Renaming them would be a migration and a loader change. We chose not to, because no book has a palette yet. If more per-book styling is coming, a rename is cheapest now.
- **Container units and tiny text.** Text that scales with the book gets small on small windows. The `clamp()` minimums and the 700×480 fallback bound this. The fallback loses the book look on phones, which we accept.
- **Fixed page boxes.** The text areas are measured on one asset. If the asset is re-exported or re-cropped, they must be re-measured, or the text drifts off the paper. They are in one constant and covered by a test of the asset's ratio.
- **No page scroll on laptops with browser zoom.** At high zoom the viewport is small and the fallback layout takes over, which is the correct outcome.
- **Paragraph splitting** on blank lines is a rendering choice, not a data change. Seeded text has no blank lines, so nothing changes for it.
- **Richer effects are deferred.** `data-book-style` is only a hook. It is cheap to keep and should not grow into untested options before the feature exists.

## Breaking Changes

- **`DEFAULT_PALETTE` and the readability rule change.** Palettes stored under the old dark-surface rule will fail the new rule and fall back to the default. No seed data is affected. Existing tests and criteria that assert the old values must be updated.
- **No database, route or external-contract change.** URL, slug rules, metadata, status codes and the `BookDetail` shape stay the same.

## Supersedes (in book-detail-page.md)

The old spec gets a pointer to this one. These criteria no longer apply as written:
- **14:** the placeholder is still `aria-hidden` in a 2:3 box, but its colours follow the new roles.
- **17:** the panel background is now the book image. The `<h1>`, button and label colours follow the new roles (criterion 12 here).
- **18–20:** replaced by criteria 13–15 and 23.
- **21:** replaced by criteria 1, 25 and 26. The cover and copy are on two pages, not stacked at 768px.
- **23:** the backdrop is now lighter, and criterion 19 here covers a failed backdrop.
- **24:** extended by criterion 24 here.

Tests to update: `tests/e2e/book-detail-page.spec.ts`, `tests/integration/book-detail-page.db.test.ts`, `src/server/books.test.ts`, and the fixtures in `tests/e2e/support/book-fixtures.ts`.

## Test Plan

**Vitest (co-located, `*.test.ts`)**
- `books.test.ts`: new readability rule and its boundaries, the new `DEFAULT_PALETTE`, old-style palettes falling back, `PARCHMENT` against the asset.
- Asset test: width files exist, alpha channel present, corners transparent, ratio matches `OPEN_BOOK.size`, page boxes inside 0–100%.
- Roman numeral and paragraph-splitting helpers, if extracted.

**Integration (existing `book-detail-page.db.test.ts`)**
- Updated for the new default palette; content rules 1–13 stay.

**Playwright (`tests/e2e/book-detail-open-book.spec.ts`)**
- Criteria 1–7 across the viewport matrix, with a long-text fixture and a 100-character title fixture.
- Criteria 9–13 using the book fixtures.
- Criteria 16–19 with blocked requests.
- Criteria 20–24 for keyboard, axe and reduced motion.
- Criteria 25–26 at the breakpoints.
- Criterion 27 with JavaScript disabled.

## Open Questions

1. ~~**Final asset**~~ **Decided:** the cleaned file is `docs/scenes/book.png`, rendered smooth like the shop. Output widths are the shop's (1376, 2064, 2752). The exact crop and text-area numbers are still to be measured on the cropped file (estimates above).
2. ~~**Which palette fields change**~~ **Decided:** keep the four keys with the new roles and a parchment `DEFAULT_PALETTE`, no migration. A rename to role names stays a possible later migration.
3. **Small-screen layout:** is a plain stacked panel that scrolls (no book image) below 700px wide or 480px tall acceptable, even though the page otherwise never scrolls? The alternatives are a smaller non-scrolling book, which would be unreadable, or a single-page version of the book image.
4. ~~**Chapter labels**~~ **Decided:** keep "Chapter I, II, …". It is decorative and `aria-hidden`, so the heading's accessible text stays "What it's about" etc. Screen-reader treatment is not a concern beyond that.
5. ~~**Pixel animation scope**~~ **Decided:** the drifting dust is not part of this spec. The entrance and cover sparkles stay.
6. **Backdrop scene:** keep the default scene as the backdrop, or use the scene the reader came from? *Proposed: default, as today.*
