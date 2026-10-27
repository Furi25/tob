# Abbey Polygon Outlines

## Goal
The Abbey's 29 books get the same exact, book-shaped outlines as the first store: the hover edge, the click area and the focus ring follow each book's real silhouette instead of a rectangle. To make that possible, the throwaway box editor in `mockups/abbey-display/` becomes a polygon editor that exports points in master pixels, and the Abbey's data is then converted from boxes to polygons.

## Scope
In scope:
- Extend the Abbey mockup editor (`mockups/abbey-display/`) so each book is edited as a polygon, not a box.
- Change the Abbey's data in `src/components/bookshop/scenes/abbey.ts` from `[x1, y1, x2, y2]` boxes to pixel polygons.
- Re-run the existing check loop and calibration (criterion 26 of [multiple-bookshop-scenes.md](multiple-bookshop-scenes.md)) on the polygons.

Out of scope:
- Any change to `hotspotFromPixels`, `Hotspot`, `Scene`, the `bookshop` scene, the schema, routes or the seed. They already support polygons.
- Automatic outline detection. Ruled out in the multi-scene spec (it cannot tell a book from the shelf behind it in painted art).
- Shipping the editor. It stays a mockup: not part of the product, not tested, and no runtime code depends on it.
- Mapping the roughly 16 unmapped Abbey books. That stays as decided in Open Question 4 of the multi-scene spec (slots 30 and up, later).
- Changing slot numbers or Tab order. Slot *n* stays slot *n*.

## Data Model
No Prisma change and no migration. The `Hotspot` type already has `rect` plus `shape`.

Only the Abbey's source data changes shape (illustrative, not working code):

```ts
// src/components/bookshop/scenes/abbey.ts
type PixelPoint = readonly [x: number, y: number];          // master pixels, origin top-left
const POLYGONS: readonly (readonly PixelPoint[])[];          // index + 1 = slot, replaces BOXES
// each entry goes through hotspotFromPixels(slot, polygon, MASTER, undefined, MASTER)
```

- The box-to-4-point-polygon wrapper in `abbey.ts` goes away. `hotspotFromPixels` takes the polygon directly.
- A book that really is an upright rectangle may stay a 4-point polygon. There is one code path.
- Slots 1..29 keep their numbers. The array order is the slot order.

## API Contracts
None. No Server Action or route handler changes.

**Editor export format (mockup tooling contract).** The editor's "Copy" button outputs the array pasted into `abbey.ts`:

```jsonc
// one polygon per slot, in slot order, integer master pixels (2752×1536)
[
  [[330, 843], [443, 850], [440, 970], [333, 962]],
  [[470, 814], [578, 820], [575, 933], [472, 929]]
]
```

Editor behaviour required (it is a mockup, so these are the author's tool needs, not product rules):
1. Each book starts as its **current box converted to a 4-point polygon**, so nothing is lost and unchanged books need no work.
2. The selected book's vertices can be **dragged**; a vertex can be **added** (on an edge) and **removed** (minimum 3 points).
3. The selected polygon can be moved as a whole, and vertices nudged with the arrow keys (Shift for 10 px), as the box can today.
4. The cursor position in master pixels stays visible, and the polygon is drawn over the picture so it can be compared with the book at zoom.
5. Edits persist in the browser as they do now. The stored key changes (for example `abbey-display-polygons-v1`), and any old box data under `abbey-display-boxes-v2` is converted once, not discarded.
6. Export is the array above. Reset restores the polygons saved in `app.js`.

## UI Surface
- **Product:** no new route, component or state. `/shops/abbey` renders the same markup. Only each book's `shape` values change, which changes the `clip-path`, edge and focus ring.
- **Mockup:** `mockups/abbey-display/` gets the polygon editing described above. It stays a static page with no build step.

## Acceptance Criteria
1. `abbey.ts` holds 29 pixel polygons and no boxes. Each has at least 3 points, all within 0..2752 × 0..1536, with non-zero area.
2. The Abbey still has exactly 29 hotspots, slot numbers 1..29 in the same order. Slot *n*'s `rect` still contains its polygon, and `rect` equals the polygon's bounding box rounded outwards to 0.1%.
3. Each Abbey `shape` is derived through `hotspotFromPixels` from the polygon, so `shape` values are percent of `rect`, rounded to 0.1, inside 0..100.
4. No two Abbey silhouettes overlap when mapped back to artwork coordinates (multi-scene criterion 4). Fixing an overlap means correcting the vertices, not drawing outside the book.
5. No Abbey polygon crosses itself (a simple polygon).
6. The existing scene data tests (`scenes.test.ts`, `artwork.test.ts`, `hotspot-shapes.test.ts`) pass for the `abbey` scene without changes to their assertions, other than the data they read.
7. For at least one Abbey book whose box was a visibly slanted or non-rectangular book, the `clip-path` is no longer a plain rectangle, and a point inside its rectangle but outside the polygon does not hover, click or show the label.
8. Calibration (multi-scene criterion 26): at 1440px and 1024px, with `?hotspots=1` on and off, every Abbey book's edge sits on that book's visible outline to within ±4 master px. Defects are filed in `docs/bugs/` with the slot number and direction. The change is not released with an open calibration bug.
9. Hit targets are not smaller than before the change by more than the book's own slack. Any book that now fails the multi-scene minimum-size criterion (criterion 21) is reported to the architect, not widened beyond its outline.
10. The `bookshop` scene's data, the seed and the schema are byte-for-byte unchanged by this feature.
11. In the editor, drag, add-vertex, remove-vertex (not below 3 points), nudge and export all work, and an exported array pasted into `abbey.ts` loads without error. (Manual check by the tester; the mockup has no automated tests.)

## Risks and Trade-offs
- **Hand-tracing 29 books is slow.** Each needs 4–8 points, so about 100–200 clicks. Starting from the existing boxes means a book that is truly rectangular costs nothing, and the work can go in slot order or in batches with the check loop run between them.
- **Small books carry the largest relative error.** The smallest Abbey books are about 60–70 px wide on the master, so a 4 px error is visible. Zoom in the editor while tracing.
- **The master is a JPEG-origin image** (see the multi-scene spec's Risks), so edges are slightly noisy. Trace the book's visible edge, not the noise.
- **Polygons can shrink a click target.** That is the accepted trade-off of silhouettes in [bookshop-display.md](bookshop-display.md). If a book becomes too small to click, the fix is a higher breakpoint, not a looser polygon.
- **We keep the editor a mockup on purpose.** Putting a polygon editor into the product is a large piece of work for artwork that changes rarely. This reverses nothing in the multi-scene spec, which only ruled out shipping one.
- **No automatic check for "edge on the book".** Calibration stays manual, by the tester.

## Breaking Changes
- **Schema:** none. **Public routes:** none. **External contract:** none.
- **Internal:** the `BOXES` array in `abbey.ts` is replaced by `POLYGONS`. Nothing else imports it.
- **Tooling:** the Abbey editor's saved-state key changes. The editor converts old saved boxes once.
- **Docs:** the multi-scene spec's "Measuring aid" paragraph and its "We deliberately did not build a polygon editor" line are updated to point here.

## Open Questions
1. **Who traces the polygons?** The spec assumes the author traces them in the extended editor. If you would rather send the polygons as a list from another tool, the editor change can be skipped and only the data change applies. Which do you want?
2. **All 29 at once, or in batches?** The spec allows either. Batching lets the check loop find mistakes earlier. Is there a priority order (for example the most prominent books first)?
3. **Should the real `?hotspots=1` overlay also show the cursor position in master pixels?** This is Open Question 8 of the multi-scene spec. This spec does not need it, because the editor shows the position.
