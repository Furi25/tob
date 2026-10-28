# Bookshop Scene Scaling on Large Monitors

Amends [bookshop-display.md](bookshop-display.md) (*Scales to fit*, Open Question 2) and [multiple-bookshop-scenes.md](multiple-bookshop-scenes.md) (*Fit the window*).

## Goal
On a large or ultrawide monitor (for example 3440×1440), the scene is drawn as large as the window allows, with the complete image always visible and no scrolling. There is **no width cap**: the scene follows the window size. The open-book page follows the same rule. Readers on big screens see bigger books and can hit them more easily.

Decisions (from the user): no cap, to try how it looks; the open-book page grows too; side bars stay as they are (no fill); the 96px chrome stays.

## Findings
- **Cause:** the rule `width = min(content width, (100dvh − 96px) × ratio, 1920px)` is limited by the **1920px cap** on tall-enough windows. At 3440×1440 the height limit would allow about 2400px, so the cap throws away roughly 20% of the available size. The screenshot (scene about 1920 CSS px wide, big bars either side, empty space under it) matches this. This is Open Question 2 of the bookshop display spec, which was left open.
- **Not a cause:** the 96px page chrome (64px toolbar + 32px bottom padding) costs about 7% of the height at 1440px. It is not the main problem.
- **A hard limit remains:** the artwork is 2752:1536 (1.79:1) and a 3440×1440 window is 2.39:1. The scene is always limited by height there, so side bars stay whatever the cap is. Only cropping or a background fill would remove them (see Open Questions).

## Scope
In scope:
- Remove the 1920px cap from the shop scene (the CSS rule and the `sizes` attribute).
- Remove the 1920px cap from the open-book stage (`.stage` in [book.module.css](../../src/components/book/book.module.css) and `SIZES` in [BookShell.tsx](../../src/components/book/BookShell.tsx)).
- Update the tests and spec text that assume 1920px.

Out of scope:
- Cropping the artwork (cover mode) or filling the side bars. Both would change which books are visible or move the hotspot maths.
- New, larger artwork files. The masters stay as they are.
- Changing the 96px chrome or the hotspot breakpoint.

## Data Model
None. No schema, migration, route or external contract changes. **Not a breaking change.**

## API Contracts
None.

## UI Surface
Route `/` only, `<BookshopScene>` (Server Component, unchanged split).

- **Shop width rule:** `width = min(content width, (100dvh − 96px) × W/H)`, where W and H are the scene's `artwork.size`. No `max-width`. The whole image is always visible (nothing is cropped) and the page never scrolls.
- **`sizes`:** drop the `1920px` term from [BookshopScene.tsx](../../src/components/bookshop/BookshopScene.tsx), leaving `min(calc(100vw − 32px), calc((100vh − 96px) × W/H))`. The browser picks the largest file when the scene is wider than the files.
- **Open-book rule:** the stage keeps its rule (smaller of the width and `(100dvh − chrome) × ratio`) without `max-width`, and `SIZES` drops `1920px`. It is a size container with text in `cqw`, whose `clamp()` upper bounds (for example `--fs-body` at 1.2rem, `--fs-h1` at 3rem) are what limit text growth. Those bounds are part of the decision; see Risks.
- **Files:** above 2752 CSS px (or 1376 at density 2) the picture is enlarged beyond the master, and looks softer. This is the accepted cost of "no cap".
- **Loading and empty states:** unchanged. Both pages still reserve their space through `aspect-ratio`.

## Acceptance Criteria
1. At 3440×1440 the shop scene is `(dvh − 96px) × W/H` wide within 1px (about 2408px for the 2752×1536 scene), centred, with no document scroll (extends BD #36).
2. At 2560×1440 the shop scene is about 2408px wide, not 1920px. This replaces the 2560×1440 clause of BD #26.
3. At 5120×2880 the shop scene is `(2880 − 96) × W/H` wide (about 4988px, no cap) and the whole image is inside the viewport.
4. At every size the scene's box lies fully inside the viewport, its bottom edge plus 32px is at most the viewport height, and the image is not cropped (`object-fit` is not `cover`).
5. At 1920×1080, 1366×768 and 1600×700 the scene width is unchanged from BD #37 (1763px, 1204px, 1082px).
6. The `sizes` attribute contains no `1920px`. At 3440×1440 on a density-1 screen the browser requests the 2752 file.
7. The open-book stage at 3440×1440 is `(dvh − chrome) × ratio` wide within 1px, centred, inside the viewport, and larger than 1920px. Its aspect ratio equals `OPEN_BOOK.size`. This replaces the cap clause of [book-detail-open-book.md](book-detail-open-book.md) (*Very wide windows*).
8. On the open-book page at 3440×1440, text stays readable and inside its pages: no overflow or clipping with the long-text and 100-character-title fixtures (extends that spec's criteria).
9. Every hotspot still meets BD #13 at a scene width of 2400px and at 4988px (the hotspots are percentages, so no change is expected).
10. Cumulative Layout Shift from both pages is still 0 and each aspect ratio is still its artwork's.

## Risks and Trade-offs
- **Blur on very large windows.** With no cap, a window taller than about 1630px (at density 1) draws the shop scene bigger than its 2752px master, and the picture gets softer the bigger it goes. On the user's 3440×1440 screen it is 2408px, below the master, so no enlargement. This is an experiment: if it looks poor on larger screens, restore a cap by changing one value.
- **Heavier loads.** A 3440×1440 screen at density 1 now loads the 2752 file (the largest) where before it loaded the 2064 file. Accepted.
- **Open-book text.** The `clamp()` upper bounds stop text growing past a point, so on very large windows the text is smaller relative to the book. Left as is, to be judged by eye.
- **Side bars stay on ultrawide.** The scene is bigger but still not edge to edge. We deliberately don't crop, because it would hide books, and don't fill the bars (user's choice).
- **Window-width bars on a 16:9 monitor are unchanged** below 1920px, because height limits first.
- **Existing tests** that expect a 1920px scene at 2560×1440 or wider need new numbers (BD #26, and the open-book spec's width tests).
- **Edits to other specs.** [bookshop-display.md](bookshop-display.md), [multiple-bookshop-scenes.md](multiple-bookshop-scenes.md) and [book-detail-open-book.md](book-detail-open-book.md) still say 1920px; they get a one-line pointer to this spec as part of the work.

## Test Assumptions
Recorded from the tester:
- 1rem = 16px, so the open-book chrome (5.5rem) is 88px.
- The open-book stage is the `<main>` element.
- Criterion 7 is measured on the fixture book.
- Criterion 8 (text) asserts containment only (no overflow or clipping), not a font size.

## Open Questions
None. All four earlier questions are answered (no cap, open-book page included, no side fill, chrome unchanged).
