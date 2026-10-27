# Bookshop Display

## Goal

The landing page becomes one illustrated, pixel-art bookshop scene. Twenty-five books are on display around the room: on shelves, a low table, a display stand and the counter. Each of those books is a real link to its detail page at `/books/[slug]`. A reader browses by looking around the room. Hovering or focusing a book shows its title and author, and clicking opens it. This keeps the discovery-first goal from [popular-books-discovery.md](popular-books-discovery.md) but replaces its editorial card grid with a single, memorable scene. The approved direction is the mockup at `mockups/bookstore-display/`. This spec covers how to build it properly in `src/`. The mockup's internals carry no weight. Only its look and interaction model do.

## Scope

**In scope**

- A production version of the scene at `/`: the background artwork, 25 positioned hotspots, a hover/focus label, and navigation to `/books/[slug]`.
- Three lossless WebP sizes of the artwork, made once from the master and served without re-encoding. The browser picks the one that suits the screen.
- A typed hotspot map (slot number → rectangle and book-shaped polygon, both in percentages) tied to one specific version of the artwork.
- Book-shaped hover and click areas, and a gold glowing edge drawn around every displayed book, as in the approved mockup (see *Hotspot shape, highlight and glowing edge*).
- An accessible list of all 25 books in a sidebar, opened by a button above the scene. It works without JS and with assistive tech, and it is the primary way to browse on small screens.
- A development-only calibration overlay that shows the hotspot rectangles so they can be lined up with the art.
- Loading, empty and partial-data states.
- A scene that always fits the browser window, in both directions, so the page never scrolls (see *Scales to fit*).

**Out of scope**

- The book detail page itself. It is specified in [book-detail-page.md](book-detail-page.md), and this feature only links to it.
- The mockup's "Load image" file picker. Readers never upload images.
- Any admin UI for moving hotspots or assigning books to slots.
- Animation beyond the hover/focus highlight and the travelling glint on each book's edge (no parallax, no other ambient motion, no sound).
- Seasonal variants or day/night versions of the art. (More than one scene is now specified in [multiple-bookshop-scenes.md](multiple-bookshop-scenes.md), which supersedes this spec's single fixed picture, its fixed 25 hotspots, `Book.displaySlot` and criterion 3. This spec still describes how one scene looks and behaves.)
- Art direction for small screens (for example, a cropped or zoomed version of the scene on phones).
- Live popularity data. The catalog stays curated, as in the existing spec.

## Data Model

This is the first Prisma model in the repo, because `prisma/schema.prisma` does not exist yet. **It needs an initial migration.** The `Book` model follows the illustrative type in [popular-books-discovery.md](popular-books-discovery.md). The only addition is a display slot.

```prisma
// Illustrative sketch — not final schema.
model Book {
  id             String   @id @default(cuid())
  slug           String   @unique
  title          String
  author         String
  tagline        String
  summary        String
  about          String
  whyPopular     String
  whyItMatters   String
  affiliateUrl   String
  coverImage     String?
  palette        Json?    // { primary, surface, text, highlight }
  popularityRank Int      @unique
  displaySlot    Int?     @unique   // 1–25; null = not shown in the scene
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

**Why `displaySlot` is separate from `popularityRank`:** books are assigned to spots at random, and a spot says nothing about rank (see Resolved). The two fields stay independent so that ranking or hand-curated placement can be added later without a migration.

**Hotspot coordinates are not stored in the database.** They describe the artwork, not the books. They live in a typed constant next to the image and change only when the image changes:

```ts
// Illustrative — src/components/bookshop/hotspots.ts
type Zone = "front-shelf" | "low-table" | "display-stand" | "counter" | "back-wall";
type Point = readonly [x: number, y: number];  // % of the hotspot's rect, 0–100 on both axes
type Hotspot = {
  slot: number;        // 1–25, unique
  zone: Zone;
  rect: { top: number; left: number; width: number; height: number }; // % of the artwork, 0–100
  shape: readonly Point[];  // the book's silhouette: a simple polygon of 3 or more points, inside `rect`
};
export const ARTWORK_VERSION: string;         // changes whenever the image file changes
export const ARTWORK_SIZE: { width: number; height: number }; // the master's intrinsic pixels: 2752×1536
export const ARTWORK_WIDTHS: readonly [1376, 2064, 2752];     // widths of the served files
export const HOTSPOTS: readonly Hotspot[];   // exactly 25 entries
```

`rect` is the hotspot's bounding box and keeps its current meaning (criteria 2, 3, 4 and 13 still apply to it). `shape` is new and describes where the book actually is inside that box. It is the only place the silhouette is stored: the hover/click area and the glowing edge are both generated from it, never hand-copied.

**Starting shapes come from the mockup.** `mockups/bookstore-display/app.js` has a `positions` array whose entry `n − 1` holds a traced `polygon(...)` for slot `n`. Production rectangles are those same rectangles with a few widths trimmed by about 0.1 so neighbours don't overlap, so the polygon percentages (which are relative to the rectangle) carry over. Convert each `polygon(x% y%, …)` to a `Point[]`. Calibration (criterion 35) refines them.

`zone` is descriptive only. No behaviour, style or test depends on it. The current zone for each slot is a best guess and gets corrected along with the rectangle during calibration (criterion 21).

Seed data for 25 books goes in `prisma/seed.ts`. **For now, the seed uses the 25 titles in `mockups/bookstore-display/index.html`.** This is placeholder content. The catalog can be swapped later without code changes, only a reseed. Fields the mockup doesn't provide (`tagline`, `summary`, `about`, `whyPopular`, `whyItMatters`, `affiliateUrl`) get short neutral placeholder text in the seed. `affiliateUrl` must be an obviously fake placeholder (for example `#affiliate-pending`), not a real retailer link. `popularityRank` follows the mockup's list order, which is the `N` in each link's `href="#book/N"`. It is a required field, but it carries no meaning yet. Slugs are kebab-case titles (`the-hobbit`, `1984`, `fahrenheit-451`, …).

**Slot assignment is random, done once at seed time.** The seed shuffles slots 1–25 across the 25 books using a fixed shuffle seed, so every environment gets the same layout and reseeding doesn't move books around. The layout stays the same between page loads. The mockup's `#book/N` → position pairing is not kept. Code and tests must not assume any particular book sits in any particular slot.

## API Contracts

The feature doesn't change any data. There are no Server Actions or route handlers.

### Server data loader — `getDisplayBooks()` in `src/server/display.ts`

- **Input:** none.
- **Output:**
  ```ts
  type DisplayBook = { slot: number; slug: string; title: string; author: string };
  type DisplayData = { books: DisplayBook[] }; // sorted by slot ascending, 0–25 entries
  ```
- **Behaviour:** selects books where `displaySlot` is not null, sorted by `displaySlot`. It returns only the four fields above, so long-form copy is never sent to the landing page.
- **Errors:** if the database is unreachable, the error goes to the route's `error.tsx`. It does not render a half-empty scene.
- **Auth:** none. This is public content.

### Calibration overlay — `/?hotspots=1`

- **Input:** the search param `hotspots`, validated with Zod as `z.enum(["1"]).optional()`. Any other value is ignored.
- **Behaviour:** this only takes effect when `NODE_ENV !== "production"`. It outlines every hotspot's rectangle in a translucent colour with its slot number, and also draws each hotspot's `shape` outline so the silhouette can be lined up with the book. In production, the param does nothing.

## UI Surface

### Route `/`: `src/app/page.tsx` (Server Component)

Fetches `getDisplayBooks()` and renders:

1. **`<BookshopScene>`** (Server Component), in `src/components/bookshop/`
   - **Scales to fit the window, so the page never scrolls.** The scene is a `position: relative` container centred in the page, with `aspect-ratio: 2752 / 1536`. Its width is the smallest of three limits:
     - **Width:** the page content area (viewport width minus the 16px side padding on each side).
     - **Height:** the free height times the artwork's ratio, where free height = viewport height − the toolbar row (64px) − the bottom padding (32px). So `width = min(content width, (viewport height − 96px) × 2752 / 1536, 1920px)`. Keep the 96px in one shared CSS value, so the page layout and the scene cannot disagree.
     - **Cap:** 1920 CSS px (see Open Questions).

     The height that counts is the visible area of the browser window, after its own toolbars and tab strip (the layout viewport, `dvh`), not the screen. Resizing the window, or a toolbar appearing or hiding, rescales the scene with no reload and no JS. F11 is not a design target, but it follows the same rule. The toolbar row keeps its fixed height and never overlaps the scene. The scene has no minimum size: when the window is very short, the scene gets small instead of the page scrolling. The scene takes up its final space before the image loads (no layout shift). Hotspots are percentages, so they scale with it. The scene's *own* width, not the viewport's, decides whether the hotspots are shown (see *Narrow scenes*).
   - **The artwork** is a plain `<img>` with `srcset` listing the three served files (`1376w`, `2064w`, `2752w`), a `sizes` value that matches the scene's width rule, including its height limit (`sizes` accepts `min()`, `calc()` and `vh`), `width`/`height` attributes of 2752×1536, and `fetchpriority="high"`. The browser picks a file from the scene's width and the screen's pixel density. `next/image` isn't used: with `unoptimized` it emits no `srcset`, and without it the optimizer re-encodes to lossy formats. This needs a commented exception to the `@next/next/no-img-element` lint rule on that one line.
   - **Smooth rendering.** The image uses `image-rendering: auto`, not `pixelated`. The scene is shrunk at almost every size, and nearest-neighbour shrinking (what `pixelated` does) drops pixels unevenly and makes edges shimmer. At 2752px wide, the master's art "pixels" are most likely several real pixels each, in which case the pixel-art look survives smooth scaling. Check this when making the smaller files.
   - One `<a href="/books/{slug}">` per filled slot, positioned using the rectangle from `HOTSPOTS`, with values passed as CSS custom properties rather than hand-written inline styles. Navigation uses links, not buttons, so it works without JS, middle-click opens a new tab, and crawlers can follow it.
   - Each link has an accessible name of "{title} by {author}".
   - Slots with no book render nothing. There are no empty clickable areas.
2. **`<HotspotLabel>`** (Client Component, the only one on the page). It displays the title and author for the hovered or focused hotspot. For a mouse, it follows the pointer. For keyboard focus, it sits next to the hotspot. It is kept fully inside the scene edges and decorative (`aria-hidden`), because the link already has an accessible name. If JS is disabled, there is no label and nothing else breaks.
3. **`<DisplayDrawer>`** (Server Component, no client JS). A button and a sidebar built on the native [Popover API](https://developer.mozilla.org/docs/Web/API/Popover_API), so it opens and closes without JS:
   - **Button:** `<button popovertarget="display-list">` with the visible text "All 25 on display". The number comes from the data, so it reads "All 18 on display" when 18 slots are filled. It sits in a toolbar directly above the scene, right-aligned, and stays visible at every width. It is never drawn over the artwork, so it can't cover a book.
   - **Sidebar:** `<nav id="display-list" popover aria-label="Books on display">`, sliding in from the right edge of the viewport. It holds a close button (`popovertarget="display-list" popovertargetaction="hide"`) and an `<ol>` of links ("{title} — {author}") in slot order.
   - **Width:** about 360px, or full width when the viewport is narrower than 840px.

   - **Focus (native popover behaviour, no JS, no `autofocus`):**
     - **Opening** leaves focus on the drawer button. The browser puts an open popover in the tab order directly after the button that opened it, so the next Tab goes to the sidebar's close button and then its links.
     - **Escape** closes the sidebar. If focus was inside it, focus returns to the drawer button.
     - **The close button** closes the sidebar and returns focus to the drawer button.
     - **Clicking outside** (the popover's built-in light dismiss) closes the sidebar. Focus goes wherever the reader clicked, which is the browser default. We deliberately don't pull it back to the drawer button, because that would fight the click (for example, clicking a book in the scene).
   - **Stacking:** it opens above the scene and the hover label, using the top layer. It does not trap focus or block the page behind it.
   - **Motion:** the slide-in uses `transition` on `transform`. Under `prefers-reduced-motion: reduce`, it appears instantly.
   - **Narrow scenes:** when the scene is narrower than 808px (see criteria 13 and 14 and Resolved), it is decorative. It still scales to fit, but its hotspots are hidden from interaction and the accessibility tree, and this sidebar is how readers browse. This is measured on the scene, not the viewport, because a short, wide window can make the scene narrow. For a window whose scene is limited by width, 808px is the same as the old 840px viewport rule (840 − 2×16). Measure it with a container query on the scene, not a viewport media query.

**Visual treatment** carries over from the mockup: dark wood surroundings, a retro label with a hard offset shadow, and the book highlight and edge described next. Focus must look clearly different from hover and must meet 3:1 contrast against the artwork around it.

**Hotspot shape, highlight and glowing edge** (reference: `mockups/bookstore-display/styles.css` and `app.js`). Today the production scene highlights a plain rectangle with no edge. The mockup follows each book's silhouette instead. Build it as follows.

- **Link box and click area.** Each `<a>` keeps the `rect` box (criterion 4). Its hover and click area is the book's `shape`, applied as `clip-path: polygon(...)` generated from `HOTSPOTS`. A point inside the rectangle but outside the silhouette does not hover, click or show the label.
- **Hover.** Inside the silhouette only, the link gets a warm fill (mockup: `#ffd27330`) and the edge goes to its strong state. The label shows as before. There is no rectangle, outline or glow around the unclipped box.
- **Keyboard focus.** The focus indicator follows the silhouette, not the rectangle. The link keeps its `clip-path` while focused and has `outline: none`, because an outline on a clipped element would be cut off or drawn as a rectangle. The indicator is made of two parts:
  - **A stronger fill.** On `:focus-visible` the link's fill is stronger than the hover fill (for example `#ffd27355` against hover's `#ffd27330`), so focus differs from hover on the link itself (criterion 7).
  - **A silhouette ring.** A second decorative svg per book, `data-hotspot-focus`, built the same way as the edge (same `viewBox`, `preserveAspectRatio="none"`, `overflow: visible`, `pointer-events: none`, `aria-hidden="true"`, a sibling of the `<a>`). It holds two `<polygon>` elements from `shape`, both with `fill: none`, `stroke-linejoin: round` and `vector-effect: non-scaling-stroke`: an outer dark ring (`data-ring="outer"`, stroke `#1f140e`, 5px) and, on top, an inner light ring (`data-ring="inner"`, stroke `#ffe5b2`, 2.5px). It has `display: none` by default and is shown only while the link is `:focus-visible` (for example with `a:focus-visible ~ [data-hotspot-focus]`). It has **no** glow filter, so the 3:1 contrast pair stays measurable. The light-plus-dark pair keeps 3:1 against any part of the artwork. A mouse click does not show it, as with any `:focus-visible` style.
  - The edge also goes to its strong state while the link has focus, so focus reads as hover plus a ring.
- **Glowing edge.** Every displayed book has an edge drawn along its silhouette at all times, not only on hover:
  - One decorative `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">` per displayed book, covering the link's box with `overflow: visible` and `pointer-events: none`. It is a **sibling** of the `<a>`, never a child, because a clipped link would also clip its children. Give it `data-hotspot-edge` for tests. A wrapper per hotspot is fine, as long as the link stays the only focusable element and keeps its role and name.
  - It contains two `<polygon>` elements built from `shape`, both with `pathLength="100"`, `fill: none`, `stroke-linejoin: round` and `vector-effect: non-scaling-stroke` (so stroke widths are screen pixels at every scene size): the **base** (`data-edge="base"`) and the **glint** (`data-edge="glint"`).
  - **Glow.** The svg has `filter: drop-shadow(0 0 3px #ffd69088)`.
  - **Resting edge.** Base stroke `#ffe0a2`, 0.8px, opacity 0.48.
  - **Strong edge** while the book is hovered or contains focus (`:hover` / `:focus-within` on the wrapper): base opacity 1 and 1.3px.
  - **Glint.** Stroke `#fff5d3`, 1.8px, `stroke-dasharray: 1 23 2 74`, animating `stroke-dashoffset` from 0 to −100 and opacity 0.35 → 0.95 → 0.35 over 5s, linear, infinite. Each book starts at a different point: `animation-delay` of `-(slot − 1) × 0.37s`.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, there are no transitions and no animations on any hotspot, edge or glint. The glint is not drawn, and the base edge and its strong state stay as static highlights.
- **When it's hidden.** The edge hides together with its hotspot: if the artwork fails to load (criterion 17) and below the breakpoint (criterion 14). In both cases it is also out of the accessibility tree. It never adds a tab stop, never changes a link's accessible name, and never blocks the pointer.
- **Empty slots** draw no edge, as they draw no link.

**States**

- **Loading:** there is no route-level `loading.tsx` and no Suspense boundary around the page content. The server waits for `getDisplayBooks()` and sends the complete HTML in one go. Next.js streams anything that resolves after a `loading.tsx` or `<Suspense>` fallback into a `hidden` element that only client JS reveals, so with JS disabled the hotspots and sidebar would never appear (criteria 1 and 22). What the reader sees while the page loads is the **artwork** loading: the scene container is already at its final width and aspect ratio, with a flat placeholder colour taken from the artwork's dominant tone, and the hotspots are in place on top of it.
- **Empty (0 display books):** the artwork renders with no hotspots and no drawer button. In their place it shows "The display is being rearranged. Check back soon."
- **Partial (fewer than 25):** the filled slots work, the empty slots are simply absent, and the button and sidebar show only the filled ones.
- **Image fails to load:** the container keeps its size with the placeholder colour, the hotspots are hidden, and the button and sidebar stay fully usable.

### Assets: `public/bookshop/scene@{ARTWORK_VERSION}-{width}.webp`

- **Master: `docs/bookstore display.png`** (2752×1536, RGBA, about 8.8 MB). It stays in `docs/` as the source of truth and is never served. Do not use `docs/bookstore display.jfif`. It is a lossy JPEG and is superseded.
- **Served files**, with `ARTWORK_VERSION = "v1"`:
  - `scene@v1-2752.webp`: the master converted to lossless WebP. Same pixels, smaller file.
  - `scene@v1-2064.webp`: the master scaled to exactly 75% (2064×1152).
  - `scene@v1-1376.webp`: the master scaled to exactly 50% (1376×768).
- **How they're made:** once, by hand or with a one-off script, not as part of the build. Downscale with an area-averaging (box) filter. Save every file as **lossless** WebP, which has the same pixels as PNG, is usually much smaller, and works in every current browser. Drop the alpha channel if the master is fully opaque. Record the tool, settings and resulting file sizes in the PR description.
- **Weight check:** most desktop screens load the 2064 file. If it comes out over 3 MB, raise it with the architect. Don't switch to lossy compression without a spec change.
- `ARTWORK_SIZE = { width: 2752, height: 1536 }` (the master), and `ARTWORK_WIDTHS = [1376, 2064, 2752]`.
- `HOTSPOTS` are percentages, so the same rectangles apply to every size.
- The filenames include the version, so a new image never sits behind old cached coordinates.

## Acceptance Criteria

1. `GET /` returns server-rendered HTML that contains one `<a>` per display book, each with `href="/books/{slug}"` and an accessible name of "{title} by {author}", without running client JS.
2. `HOTSPOTS` contains exactly 25 entries with unique `slot` values 1–25, and every rectangle stays within 0–100 on both axes.
3. No two hotspot rectangles overlap.
4. A book with `displaySlot = n` renders at the rectangle for slot `n`. A slot with no assigned book renders no interactive element.
5. `displaySlot` is unique and limited to 1–25. A seed or write that breaks this fails.
6. Hovering a hotspot with a mouse shows a label with that book's title and author. Moving off hides it.
7. Tabbing to a hotspot shows the same label next to it, plus a visible focus indicator that looks different from the hover style.
8. The label never extends past the edges of the scene container, at any hotspot, at 1440px, at 1024px and at the breakpoint width (840px).
9. Pressing Enter on a focused hotspot, or clicking it, goes to that book's detail page.
10. Tab order through the hotspots follows slot order 1→25.
11. The artwork response is one of the three committed files in `public/bookshop/`, byte for byte, with no re-encoding by an image optimizer. Those files are lossless WebP at exactly 1376×768, 2064×1152 and 2752×1536. The image renders with `image-rendering: auto`, not `pixelated`.
12. The scene has the artwork's aspect ratio (2752:1536) before the image loads. Cumulative Layout Shift from the scene is 0.
13. Whenever the hotspots are shown (the scene is at least 808px wide, the breakpoint), every hotspot meets WCAG 2.5.8. Either it is at least 24×24 CSS px, or a 24px-diameter circle centred on it doesn't intersect another hotspot or another undersized hotspot's circle. Test at viewport widths 840px, 1024px, 1280px, 1440px and 1920px, each at a height tall enough for the scene to be limited by width (900px high up to 1440px wide, 1200px high at 1920px wide), and at a short, wide window of 1600×700. If calibration or any other change to `HOTSPOTS` makes a slot fail at the breakpoint, the breakpoint goes up until all pass, and this spec is updated.
14. When the scene is narrower than 808px, the hotspots cannot be clicked or focused and are not in the accessibility tree. The drawer button is visible, and every display book can be reached through the sidebar. At 840px wide the scene is 808px wide and the hotspots are shown. At 839px wide they are hidden. At 1600×500 the scene is about 724px wide and they are hidden.
15. The sidebar lists the same books, in the same order, with the same links as the hotspots. The button's label shows the real count.
16. With 0 display books, the page shows the empty-state message, with no hotspots and no drawer button.
17. If the artwork fails to load, the hotspots are hidden, and the button and sidebar still work.
18. In a non-production build, `/?hotspots=1` outlines all 25 rectangles labelled with slot numbers. In a production build, the same URL renders the normal page.
19. The landing page response contains no `about`, `whyPopular`, `whyItMatters` or `affiliateUrl` content.
20. With `prefers-reduced-motion: reduce`, hover and focus highlights and the sidebar slide-in happen instantly with no transition.
21. **Calibration check (manual, by the tester):** with the overlay on, each rectangle covers the matching book in the committed artwork, at 1440px and 1024px. Any mismatch is filed in `docs/bugs/`.
22. With client JS disabled, clicking the drawer button opens the sidebar, and its links go to the detail pages.
23. Using the keyboard only:
    - Pressing Enter on the drawer button opens the sidebar, and focus stays on the button.
    - The next Tab focuses the sidebar's close button, and the Tab after that focuses its first link.
    - With focus inside the sidebar, Escape closes it and focus returns to the drawer button.
    - With focus inside the sidebar, activating the close button closes it and focus returns to the drawer button.
    - Clicking outside the open sidebar closes it. If the click lands on a focusable element, that element has focus afterwards, not the drawer button.
24. The drawer button doesn't overlap the scene at 1440px, 1024px, 768px or 375px.
25. After `prisma db seed`, the 25 books occupy slots 1–25 exactly once. Running the seed twice produces the same book-to-slot mapping. That mapping is not the mockup's list order (book `#book/N` in slot `N` for every `N`).
26. At viewports 375×812, 768×1024, 1024×768 and 1440×900, the scene is as wide as the page content area (the viewport width minus 32px, within 1px), with height following the 2752:1536 ratio, and the document has no horizontal scrollbar. At 2560×1440, the scene is 1920 CSS px wide and centred. (These sizes are all limited by width, not height. See criterion 37 for the height limit.)
27. The browser loads the file that fits the screen: `scene@v1-1376.webp` at 375px wide with pixel density 2, `scene@v1-2064.webp` at 1440px with pixel density 1, and `scene@v1-2752.webp` at 1440px with pixel density 2.
28. Every entry in `HOTSPOTS` has a `shape` of 3 or more points, every coordinate is within 0–100, and the polygon has a non-zero area.
29. The hover and click area follows the silhouette. For each slot, a point inside the rectangle but outside `shape` (a corner the polygon cuts off) does not hit the link (`elementFromPoint` returns something else), and a point inside `shape` does. Hovering the first point shows no label. Hovering the second shows it, and clicking it opens that book's detail page.
30. On hover, the link's computed `clip-path` is a `polygon(...)` matching its `shape`, and its background goes from transparent to a non-transparent warm colour. At rest the background is transparent. No `outline` or `box-shadow` is drawn on hover.
31. Every displayed book has exactly one `[data-hotspot-edge]` svg that is `aria-hidden="true"`, has `pointer-events: none` and is not a descendant of its `<a>`. It contains a base and a glint polygon whose `points` match the book's `shape`. At rest the base polygon's computed stroke is `#ffe0a2` at opacity between 0.4 and 0.6, and the svg's computed `filter` contains `drop-shadow`. On hover, and again on keyboard focus, the base polygon's opacity is 1 and its stroke is wider than at rest.
32. The edge adds no tab stops and does not change any link's role or accessible name: criteria 1 and 10 still pass, and the accessibility tree still holds one link per displayed book.
33. On keyboard focus, the link's computed `clip-path` is still the book's `polygon(...)` and it has no outline. Its background is a non-transparent colour that differs from its hover background. Its book has one `[data-hotspot-focus]` svg that is `aria-hidden="true"`, has `pointer-events: none`, is not a descendant of the `<a>`, and contains an outer and an inner polygon whose `points` match the book's `shape`. That svg is displayed while the link has keyboard focus and is not displayed at rest, on mouse hover, or after a mouse click on the link. The inner ring's stroke is at least 2px wide and light (`#ffe5b2`), the outer's at least 4px wide and dark (`#1f140e`), and the svg has no `filter`. The focus style differs from both the resting and the hover style (criterion 7).
34. With no motion preference, each glint polygon has a running CSS animation of 5s, and no two books have the same `animation-delay`. With `prefers-reduced-motion: reduce`, no hotspot, edge or glint has an animation or a non-zero transition, and the base edge stays visible at rest. This extends criterion 20.
35. **Calibration check (manual, by the tester):** at 1440px and 1024px, with `/?hotspots=1` on and again with it off, each book's edge sits on that book's visible outline in the artwork. Compare against `mockups/bookstore-display/` at the same viewport. A visible gap, overhang or an edge on the wrong book is filed in `docs/bugs/`. This extends criterion 21.
36. **The page never scrolls.** With 25 books on display, at viewports 375×812, 812×375, 768×1024, 1024×768, 1280×720, 1366×768, 1440×900, 1600×700, 1920×1080 and 2560×1440, the document has no vertical or horizontal scroll (`scrollHeight <= innerHeight` and `scrollWidth <= innerWidth` on the root element), and the scene's bottom edge plus 32px is at most the viewport height. After resizing the window from 1440×900 to 1600×700 without reloading, this still holds.
37. **The scene fills the window without scrolling.** The scene's width is the smallest of the content width, the height limit and 1920px, within 1px: at 1920×1080 it is 1763px wide ((1080 − 96) × 2752/1536), at 1366×768 it is 1204px, and at 1600×700 it is 1082px. It is horizontally centred, its height follows the 2752:1536 ratio, and the toolbar does not overlap it (this extends criterion 24).
38. **Narrow scenes are decorative.** At 1600×500 the scene is about 724px wide, the hotspots, edges and focus rings are hidden and not in the accessibility tree, the drawer button works, and criterion 36 still holds. At 1600×560 (the scene is about 831px wide) the hotspots are shown. This extends criterion 14.

## Risks and Trade-offs

- **The coordinates are guesses until calibrated.** The mockup's 25 rectangles came from instructions written for a different image (`image_1.png`), and they were never checked against `docs/bookstore display.png`. The mockup also never loaded any image by default. Expect most rectangles to need rework. Criterion 21 and the overlay exist for this reason.
- **The PNG may be a converted JPEG.** A `.png` file is lossless, but if it was exported from the `.jfif`, the JPEG artifacts are already baked in. Check it at 400% zoom for colour noise around edges. If artifacts are there, the art needs re-exporting from the original source. That changes the look, not the code.
- **Placeholder catalog.** The 25 classics are stand-ins. They don't match `docs/books.json` (2026 bestsellers) or the older mockups. Swapping them is a reseed. Any slot whose book changes size or shape in a future artwork version means recalibrating that slot.
- **Coordinates are tied to the art.** Any change to the image, even a crop, can break all 25 hotspots. Versioned filenames and keeping `HOTSPOTS` next to the image keep this visible, but nothing enforces it automatically.
- **Small screens.** Below the breakpoint the scene scales down and is decorative, and the sidebar is how readers browse. We chose that over pinch-zoom or pan-and-zoom, because those are harder to make accessible and to test. The cost is that mobile readers get a less distinctive experience.
- **Popover API support.** It is supported in every current major browser (Baseline 2024), but older browsers ignore `popover`. There, the sidebar either never opens or shows inline. We accept this and don't add a JS polyfill. Tester: check the latest two versions of Chrome, Edge, Firefox and Safari.
- **The sidebar doesn't block the page.** A popover doesn't trap focus or make the background inert. That's intentional, because the list is a navigation aid, not a task the reader has to finish. If it ever gains forms or filters, switch to a modal `<dialog>`, which needs client JS.
- **Focus stays on the button when the sidebar opens.** We follow native popover behaviour instead of moving focus in with `autofocus` or client JS. The next Tab reaches the list. Moving focus in automatically would need either `autofocus` (whose handling differs between React's rendering on the server and in the browser, and which is easy to break) or a client component. Neither is worth it for a navigation list. One known gap: Safari on macOS doesn't focus buttons on mouse click, so after a *mouse* open and close, focus may land on the page body rather than the drawer button. Criterion 23 is therefore tested with the keyboard.
- **Random placement is cosmetic.** Some spots are large (the display stand) and some are tiny (the back wall), so a random shuffle gives some books more prominence than others for no reason. That's accepted while there's no ranking. A per-visit reshuffle was not chosen: it would defeat caching, make the layout differ between visits and between users, and make calibration bugs hard to reproduce.
- **This conflicts with the existing spec on shelves.** [popular-books-discovery.md](popular-books-discovery.md) lists "shelf metaphors" as out of scope. Here, the shelves are only illustration. Navigation is still a flat list of 25 links, not a hierarchy, so the "no tree browsing" intent still holds.
- **Never scrolling shrinks the scene on short windows.** The scene is limited by the window's height as well as its width. On a 1080p screen in a normal browser (about 950px of visible height) the scene is about 1530px wide, not the 1888px a width-only rule gives, and on a 16:9 laptop with tabs and a toolbar it is smaller still. We chose this because the reader sees the whole room at once and never has to scroll to find a book. The cost is a smaller picture, and smaller books, on screens that are short for their width. There is no minimum size: a very short window gives a tiny scene and hides the hotspots (criterion 38), and the sidebar remains. We chose that over letting the page scroll.
- **The breakpoint is now measured on the scene.** The hotspots hide when the scene is narrower than 808px, not when the viewport is narrower than 840px. For a width-limited window nothing changes. A short window can now hide the hotspots at a wide viewport, which a viewport rule could not do. The implementation needs a container query on the scene instead of the viewport media query it has today, and the sidebar and the hotspots' CSS must stay in agreement about that threshold.
- **The toolbar row and padding use up height.** The 96px (64px toolbar plus 32px bottom padding) is taken from every window, however short. We kept the toolbar in its own row so it never covers a book. Putting it over the scene would give back 64px of height, but it would hide part of the picture.
- **Scaling to fit.** The scene fills the window's width and height, up to 1920px wide, and the browser picks one of three pre-made sizes. The costs:
  - **Softer than pixel-perfect.** The image is resampled at almost every width, so we use smooth scaling. Edges are a little softer than the master. When the scene is drawn larger than the biggest file (for example 1920px wide on a pixel-density-2 screen), it is enlarged slightly and looks a bit blurry. Both are accepted.
  - **Small books shrink with the scene, which sets the breakpoint.** With the current, uncalibrated coordinates, the four counter books (slots 21–24) are about 3% of the scene's width and sit about 1.6% of the scene's width from each other's edges. They depend on WCAG's spacing exception, which needs 12px from each centre to the neighbouring rectangle. That holds once the scene is at least 750px wide. At a 768px viewport the scene is about 736px, and the implementation measured those books at about 22px wide with overlapping spacing circles. 840px gives the scene about 808px (about 12.9px of spacing), which leaves margin for sub-pixel layout and small padding changes. The cost: tablets in portrait (768–834px wide) get the decorative scene and the sidebar, not clickable books. Their books would only be about 22–27px wide anyway, which is a poor touch target. Calibration (criterion 21) will move these rectangles, so the breakpoint must be re-checked against criterion 13 afterwards. Readers below the breakpoint use the sidebar.
  - **Weight on high-density laptops.** A 1440px-wide pixel-density-2 screen loads the 2752 file, the heaviest. Lossless WebP keeps it well under the 8.8 MB PNG, but it is still the largest asset on the page.
  - **One lint exception.** Using `<img>` instead of `next/image` needs a commented `@next/next/no-img-element` exception on that line.
- **No loading skeleton while the server fetches data.** Dropping `loading.tsx` means a slow database shows the browser's normal "page loading" state, not a placeholder scene. We accept this because the query reads at most 25 rows by a unique index and only four columns. Working without JS (criteria 1 and 22) matters more than a skeleton. If the page ever needs slow data, put it in its own `<Suspense>` boundary *below* the scene and sidebar, never around them.
- **Hover-only discovery.** The label is an enhancement. The real information is the link's accessible name and the sidebar. Touch readers on tablets above the breakpoint get no hover preview and go straight to the detail page.
- **Shapes are traced by eye.** The mockup's polygons were traced approximately and its README says they were never checked in a browser. Expect to refine some of the 25. Criterion 35 and the overlay exist for this.
- **A silhouette is a smaller target than its rectangle.** The click area shrinks to the polygon, which can be about half the rectangle. Criterion 13 is still measured on the rectangle, as before. That under-reports how hard the smallest books (slots 21–24) are to hit, so re-check them by hand after calibration. If they feel too small, the fix is a higher breakpoint, not a looser polygon.
- **Focus ring needs two svgs per book.** It can't be an `outline` on the link, because the link is clipped to the silhouette. So each displayed book gets the edge svg and a focus svg, which is 50 extra svgs at most. The focus svg is `display: none` until focused, so it costs nothing at rest.
- **Existing focus test.** `tests/e2e/bookshop-display.spec.ts` #7 compares the link's own outline, box-shadow, background and border for resting, hover and focus. That test keeps passing only because the focus fill is stronger than the hover fill (see Keyboard focus), since the link no longer has an outline. Tester: extend it to cover the ring (criterion 33), and don't weaken it.
- **25 glowing, animated edges cost paint time.** `drop-shadow` plus an infinitely animating dash is repainted every frame on up to 25 svgs. Accepted for the design. If profiling shows jank on low-end devices, drop the glint first, then the glow, and leave the static base edge.
- **Animations never finish.** Tests that wait for all animations on the page (for example `getAnimations()` then `finished`) would hang on the glint. Tester: scope those waits to the link, or emulate reduced motion.
- **We deliberately did not** add an admin hotspot editor, store coordinates in the database, or support multiple scenes. Each of those adds a lot of work for an artwork that is expected to change rarely.

## Breaking Change

- **The planned `/` route changes design.** The editorial card grid under *UI Surface → Landing page* in [popular-books-discovery.md](popular-books-discovery.md) is replaced by this scene. No code exists yet for that route, so nothing already shipped breaks. Any work started from the old landing-page section should stop.
- **Schema:** this introduces the first Prisma model and migration (`Book`, including `displaySlot`).
- The `/books/[slug]` route is unchanged.
- **`Hotspot` gains a required `shape` field.** `rect` is unchanged, so existing consumers and tests that read `rect` keep working. Anything that builds a `Hotspot` by hand must add a `shape`.
- **The scene's size rule changes (2026-10-24).** It was "as wide as the page, up to 1920px". Now it is limited by the window's height too, so on short windows the scene is smaller than before and the page no longer scrolls. Criteria 13, 14 and 26 change, and 36–38 are new. Existing tests that assume a 1920px scene at a given width, for example a viewport of 1952×1100 (the scene is now about 1799px wide), need new viewport heights. The `sizes` attribute and the hotspot-hiding CSS change with it: the viewport media query at 840px becomes a container query on the scene. No route, schema or external contract changes.
- **Visible change to `/`.** The hover fill becomes the book's silhouette instead of the rectangle, every book gets a glowing edge with a travelling glint, and the keyboard focus ring follows the silhouette instead of the rectangle. No route, schema or external contract changes.

## Resolved

- **Catalog (2026-10-24):** use the 25 placeholder titles from `mockups/bookstore-display/index.html` for now. See the seed note under Data Model.
- **Artwork (2026-10-24):** the source is `docs/bookstore display.png`. The `.jfif` is not used.
- **Slot assignment (2026-10-24):** random. Spots carry no ranking. Implemented as a fixed shuffle at seed time. See Data Model.
- **Book list on desktop (2026-10-24):** a button opens a sidebar with the list, at every viewport width. See `<DisplayDrawer>`.
- **Sidebar focus (2026-10-24):** native popover focus behaviour, no JS. Opening leaves focus on the button. Escape and the close button return focus to it, and clicking outside leaves focus where the reader clicked. This replaces the earlier "focus moves in on open, returns on every close" wording, which the Popover API can't do without client JS.
- **Never scroll (2026-10-24):** the page must not scroll in a normal browser window with its toolbars, so the scene is also limited by the window's height (the layout viewport, minus the 96px toolbar and padding). F11 is not a design target. The toolbar stays in its own row. This replaces the width-only scaling rule below. See *Scales to fit the window* and criteria 36–38.
- **Mobile breakpoint (2026-10-24, revised):** 840px, now measured as a scene width of 808px (see *Never scroll*). Below that, the scene is decorative and the sidebar is how readers browse. It started at 768px, but the implementation measured slots 21–24 failing criterion 13 at 768px (scene about 736px wide). The arithmetic is under Risks → Scaling to fit. It must be re-checked after calibration.
- **Scene scaling (2026-10-24):** the scene scales to fit the page width (up to 1920px) with smooth rendering, and the browser picks from three lossless WebP sizes. This replaces the brief fixed 1376×768 version, which had replaced the original whole-number scaling rule.

- **Loading state (2026-10-24):** no route-level `loading.tsx` and no Suspense around the scene or sidebar, because streamed content stays hidden without client JS and breaks criteria 1 and 22. The loading state is the scene placeholder shown while the artwork downloads. See States → Loading.
- **Highlight design (2026-10-24):** the look follows the approved mockup `mockups/bookstore-display/`: silhouette hover and click area, an always-visible gold glowing edge, and a travelling glint. The current production rectangle highlight is a defect against that design. See *Hotspot shape, highlight and glowing edge*.
- **Glint kept (2026-10-24):** the travelling glint stays, as in the mockup. Under reduced motion it is not drawn.
- **Focus ring (2026-10-24):** the keyboard focus ring follows the book silhouette, not the rectangle. It is a separate svg, because an outline on the clipped link would not show it. See *Keyboard focus*.
- **More scenes (2026-10-25):** the landing page's picture becomes the default scene `bookshop` of a registry of scenes. See [multiple-bookshop-scenes.md](multiple-bookshop-scenes.md). Where the two specs disagree on the hotspot exports, `displaySlot`, the `scene@` file names, the number 25 or criterion 3, the new spec wins once built.
- **Mockup list order (2026-10-24):** the mockup no longer has `data-id` attributes. Its list order is the `N` in `href="#book/N"`. The seed's `popularityRank` and criterion 25 refer to that order.

## Open Questions

None blocking.

1. *(Non-blocking)* Should books be reshuffled every so often, for example on each reseed or on a schedule? Today the shuffle is fixed. Changing it only touches the seed.
2. *(Non-blocking)* **Size cap.** The scene is still capped at 1920px, as before. On a large monitor (for example 2560×1440) the page then shows a 1920px scene with bars either side, not "as big as the window allows". Raising the cap to the master's width (2752px) would use more of the screen, but the picture would be enlarged on pixel-density-1 screens above that width. Which do you want: 1920px, 2752px or no cap?
3. *(Non-blocking)* **Empty state.** Criteria 36–38 are for the page with books on display. With 0 books the message sits below the scene and adds height, so that page can scroll on short windows. Should the empty-state message be put inside the height budget (for example with a fixed reserved row), or overlaid on the scene?
