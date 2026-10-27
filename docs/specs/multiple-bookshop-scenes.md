# Multiple Bookshop Scenes

## Goal

A reader can visit more than one illustrated store. Each store is its own pixel-art picture with its own set of clickable books in its own places, and every book still links to `/books/[slug]`. Today the landing page has exactly one picture and one hard-coded list of 25 hotspots. After this ships, a picture and its hotspots form a **scene**, new scenes are added by adding data and artwork (not by changing components), and readers move between scenes with a small switcher above the picture. The look and behaviour of a scene is the one in [bookshop-display.md](bookshop-display.md): this spec only generalises what that spec hard-codes for one picture.

## Scope

**In scope**

- A scene registry: each scene is an id, a name, alt text, artwork (master size, version, served widths) and a list of hotspots.
- Hotspots authored from **pixel coordinates measured on the master image, or on a uniformly scaled copy of it**, with the percentage `rect` and `shape` derived from them (see *Hotspot Coordinates*). The existing bookshop scene keeps its current percentage data untouched.
- Per-scene book placement in the database, replacing the single `Book.displaySlot`.
- Per-scene routes, a scene switcher, and per-scene artwork files.
- Scene-independent layout: the aspect ratio, the "fit the window" size rule and the `sizes` attribute follow each scene's own artwork size.
- Generalising the asset script and the existing tests so they run for every scene.
- A repeatable way to check a new scene's coordinates against its art (the existing `?hotspots=1` overlay, plus the checks below).

**Out of scope**

- Any admin UI for drawing hotspots, moving them or assigning books to slots.
- Storing hotspot coordinates or scenes in the database. They describe artwork, so they stay in code next to it.
- Transitions between scenes, shared animation, or any new ambient motion.
- Day/night or seasonal variants of one scene. A variant is just another scene.
- Small-screen art direction (cropped or zoomed art). The existing rule stays: a narrow scene is decorative and the sidebar is how readers browse.
- Remembering which scene a reader came from. "Back to the shop" on a book page still goes to `/`.
- Live popularity data, or changing the book catalog.
- Mapping the Abbey's remaining visible books (about 16). The Abbey ships with the 29 in the appendix. More can be added later as slots 30 and up (see Open Question 4).

## Hotspot Coordinates

This section answers the open question of how exact the coordinates have to be, and what to hand over.

### How exact they must be

The hover area is the book's `shape`, and the glowing edge is drawn *along* that shape, not along the book in the picture. So a shape that is off the book is visible: the gold line floats beside the book, or cuts into it. The mockup's coordinates, traced by eye, were already wrong for the final image (see [bookshop-display.md](bookshop-display.md), *Risks*), so exactness matters here more than for a plain click target.

| Measure | Value |
|---|---|
| Master size (current scene) | 2752×1536 px |
| 1 master px at the 1920px size cap | 0.70 CSS px |
| 1 master px at a 1440px scene | 0.52 CSS px |
| Edge stroke at rest / glow | 0.8px / 3px |
| Smallest current book (slot 7) | about 60×90 master px |

- **Target: every vertex within ±4 master px (about 0.15% of the width) of the book's visible outline.** At the 1920px cap that is about 3 CSS px, which is the width of the glow, so errors below that read as "on the book". At 1440px the same error is about 2 CSS px.
- **Larger errors are visible** as a gap or an overhang and are calibration defects (criterion 26).
- **Do not rely on the glow to hide errors.** The glow is the same size at every scene width, so a 10px error is obvious on a laptop.
- **Trace only what is visible.** A book partly behind another object gets a shape for its visible part. If that part is too small to click, that is a result of criterion 21, not something to fix by drawing outside the book.
- **Precision of the stored values:** `rect` to 0.1% of the artwork (about 2.7 master px at 2752px wide). `shape` to 0.1% of its own `rect`, which for a book 3% wide is far finer than a pixel. This stays below the ±4px target, so rounding is never the cause of a visible error.

### What we need from the author, per scene

1. **The master image**, as exported, in `docs/scenes/<scene-id>.<png|jpg|jfif>`. This is the file that gets served (resized), so it is the file the coordinates must belong to. A PNG is preferred. A JPEG is accepted when no lossless original exists, but its compression artifacts are then part of the art (see Risks). The file's size is read from its header, so no size has to be typed in.
2. **Coordinates in a declared pixel space**, origin top-left, x to the right, y down. The space is either the master's own size or a **uniformly scaled copy** of it (for example 1920×1080 for a 2752×1536 master), and the author states its size. Uniform means resized as a whole picture, with no crop and no padding. Percentages come out the same, so the stored data is the same, but the measuring precision is the copy's: at 1920 wide, 1 px of error is 1.43 master px. Per book:
   - **Best: a polygon** of 3 or more points walking round the visible outline of the book. 4–8 points is typical.
   - **Acceptable for upright, face-out books: a rectangle** (`x`, `y`, `width`, `height`), stored as a 4-point polygon. The edge is then a rectangle, which looks wrong on slanted books. Use it only if the book really is a rectangle in the picture.
   - **Not acceptable: percentages estimated by eye, or by a tool that viewed a smaller copy.** That is exactly the failure that sent the first mockup's rectangles to the wrong places.
3. **Slot numbers**, 1..N with no gaps. Tab order follows slot order, so number them in a sensible reading order for the picture (for example left to right, back to front). The seed shuffles which book goes in which slot, so the number carries no other meaning.
4. **Scene name** (the switcher label, 1–3 words) and **alt text** (one sentence describing the picture).

Any image editor that shows the cursor position in image pixels can produce polygons, and annotation tools that export polygon JSON work too, provided they measure on the master. The input can be a plain list. The implementer converts it:

```jsonc
// Illustrative input only — not a file format the app reads at runtime.
{
  "scene": "corner-cafe",
  "slots": [
    { "slot": 1, "points": [[212, 1204], [301, 1190], [322, 1385], [230, 1402]] },
    { "slot": 2, "rect": { "x": 640, "y": 800, "width": 88, "height": 140 } }
  ]
}
```

### How they are turned into the stored form

Authoring stays in master pixels, so correcting one vertex means changing one pair of numbers, and nothing is converted by hand. A small pure helper derives the existing `Hotspot` shape from the pixel polygon (illustrative signature, not working code):

```ts
// src/components/bookshop/hotspots.ts
type PixelPolygon = readonly (readonly [x: number, y: number])[];  // pixels of `space`
declare function hotspotFromPixels(
  slot: number,
  polygon: PixelPolygon,
  space: { width: number; height: number },  // the pixel space the points were measured in
  zone?: string,
): Hotspot;
```

- `rect` is the polygon's bounding box as a percentage of the artwork, rounded **outwards** to 0.1 so the shape is always inside it.
- `shape` is each vertex as a percentage of that `rect`, rounded to 0.1.
- Each coordinate is divided by `space.width` or `space.height` and not by the master's size, so a scene authored on a 1920×1080 copy needs no conversion to 2752×1536. A `space` whose aspect ratio differs from the master's by more than 1% fails the check, because that means the copy was cropped or padded (a stretched copy is accepted and mapped per axis).
- It throws if any point is outside `space`, there are fewer than 3 points, or the area is zero. A scene fails to load (and the build fails) rather than rendering a wrong map.
- Rectangles are 4-point polygons, so there is a single code path.
- Rectangle bounding boxes may overlap each other, because the link is clipped to its silhouette and the clip decides hits. What may not overlap is the silhouettes (criterion 4). This replaces [bookshop-display.md](bookshop-display.md) criterion 3 for all scenes. The current scene already satisfies it.

### The check loop

1. The author supplies the PNG and coordinates.
2. The implementer adds the scene. Automated checks (criteria 2–6) catch impossible data: out of bounds, self-crossing, overlapping silhouettes, too-small books.
3. The tester opens `/shops/<id>?hotspots=1` at 1440px and 1024px and compares each outline to its book (criterion 26). Defects are filed in `docs/bugs/` with the slot number and which way the edge is off.
4. The author corrects the vertices in master pixels. Repeat until no defect is left.

**Measuring aid.** Measuring on the master by eye in an image editor is slow and error-prone for 30+ books. The box editor in `mockups/abbey-display/` was used for the Abbey. It is a mockup, so it is not shipped and not tested, and its output is the same `[x1, y1, x2, y2]` list as above. Whether the real `?hotspots=1` overlay should also show the cursor position in master pixels is Open Question 8.

Automatic detection of "edge not on the book" (for example, by sampling the artwork under the edge) was not chosen. It can't tell a book from the shelf behind it reliably in a painted image, so it would add a second source of wrong answers.

### Inputs received (2026-10-25)

**Files** in `docs/` and `docs/scenes/`:

| File | Finding |
|---|---|
| `docs/scenes/bookstore display.png` | the existing bookshop master, copied here. `docs/bookstore display.png` is still there too. |
| `docs/scenes/gothic.png` | the gothic master, **2752×1536** (confirmed by the author on 2026-10-25). I could not read the header myself, so the implementer still checks it against `artwork.size` (criterion 6). |
| `docs/scenes/gothic.jfif` (removed) | an earlier JPEG of 2752×1536 with Google C2PA (AI-generation) metadata. It is no longer in `docs/scenes/`. |
| `docs/gothic.png`, `docs/gothic.jfif` | older copies in `docs/`. Not used by this spec. |

**First list (superseded by the second list below).** Two entries, both titled "Example Target Book", in a `1920×1080` space measured on an image called `image_4.png`, as pixel rectangles:

| Entry | left, top, width, height (1920×1080) | Percent of artwork | In the 2752×1536 master |
|---|---|---|---|
| "Book 1" | 228, 569, 75, 103 | 11.875 / 52.685 / 3.906 / 9.537 | x 327–434, y 809–956 (about 107×147 px) |
| "Book 13" | 991, 542, 71, 88 | 51.615 / 50.185 / 3.698 / 8.148 | x 1421–1522, y 771–896 (about 102×125 px) |

What this means:

- **Only two books are mapped,** and the comment in the snippet says more entries go there. Nothing can ship from two entries. The slot numbers 1 and 13 are only meaningful if the list is complete.
- **The space is not the master's.** 1920×1080 is 1.778:1 and the master is 1.792:1, so that copy is either stretched by 0.8% or it was cropped or padded. If stretched, the conversion is exact (the percentages above). If cropped or padded, every coordinate is off by up to about 11 master px, which is past the ±4px target. The criteria allow only the stretched case (criterion 5).
- **It is unclear that `image_4.png` is `gothic.jfif`.** If it is a different file (for example an earlier generation of the same prompt), the coordinates don't apply at all.
- **Rectangles only.** The edges will be rectangles, which is acceptable for upright books and wrong for slanted ones.
- **Precision is limited by the 1920px copy.** One pixel of error there is 1.43 master px, so a careful measurement fits the ±4px target. Numbers read off a picture by a model usually don't, so plan on correction loops (criterion 26).

**What the picture shows** (seen as a pasted image of about 1376×768 on 2026-10-25; estimates by eye, not measurements):

- **Plausibility of the two entries:** scaled to that image, "Book 1" lands on the leftmost easel book under the arched window, and "Book 13" lands on the single book on top of the centre round table. Both are on a book, so the 1920×1080 space is most likely this picture resized as a whole. This is not proof for the other books.
- **It has the same ratio as the bookshop:** 1376×768 is 1.792:1, the master's ratio, so it is probably a half-size view of a 2752×1536 file.
- **About 45 face-out books** are visible, nearly twice the bookshop's 25: three easel books on the left, three round tables (about 7, 6 and 5 books), two wall shelves in the middle (about 8), two shelves on the right wall (about 8), a bookcase with two rows of face-out books on the right (about 7), and a pair of books on the floor. Many are slanted or lean against a stand.
- **Several are small.** The wall-shelf books are about 40×50 px in the half-size image, so about 23×29 CSS px at the 808px breakpoint. They sit just under 24px and rely on the spacing exception in BD #13, which needs the 4–5px gaps between them to hold. Criterion 25 will decide whether the global breakpoint must rise.

### Second list: "The Abbey", 29 rectangles in master pixels (2026-10-25, superseded by the third list below)

The numbers from this list are no longer in the appendix. The checks are kept because they explain why the list was re-measured.

The author sent a full list, headed "High-Resolution Bounding Box Dataset", for a `2752×1536` master, as `[x1, y1, x2, y2]` (left, top, right, bottom), with the scene name **The Abbey**. It is no longer in the appendix (see the third list). A rectangle becomes `x = x1`, `y = y1`, `width = x2 − x1`, `height = y2 − y1`, with the master as the `space` for `hotspotFromPixels`. The scene id is `abbey` and its master stays at `docs/scenes/gothic.png` (the path is stored on the scene, so nothing is renamed).

**Checks I could do without opening the file** (done by hand on the numbers, and by eye against the pasted half-size picture, so treat the eye part as a prompt to check, not a measurement):

| Check | Result |
|---|---|
| Format | OK. 29 entries numbered 1–29, all inside 2752×1536, all with positive width and height. |
| Silhouettes overlap (criterion 4) | **Fails once:** Book 2 `[458,779,560,915]` and Book 10 `[551,858,592,933]` overlap by 9×57 px. |
| Size and spacing at the 808px breakpoint (criterion 25) | **Books 4–8 fail.** They are 44–47 px wide and 57–59 px tall in the master, side by side with 2–4 px between them. At an 808px scene (0.29 CSS px per master px) they are about 13×17 CSS px with their centres under 14 CSS px apart, so the 24px spacing circles intersect. They pass only when the scene is about 1420px wide or more (24 ÷ 46.5 px pitch × 2752). Books 22–29 are 67–70 px wide with an 88 px pitch and pass from about 751px. The tester computes all 29 once the list is final. |
| Agreement with the first list | **Disagrees beyond the tolerance.** The two lists name the same Book 1 and Book 13. Book 1 differs by −3/−7 px in x and −17/−16 px in y, and Book 13 by −12/−12 px in x and −16/−20 px in y. The ±4px target is not met by at least one of them. |
| Agreement with the picture | **Doubtful in places.** Books 9 and 10 map (in the half-size picture) to about 208–238×335–373 and 275–296×429–466, which is the arched window's glass and sill, where I see no book. Books 22–25 start at about x = 1128 in the half-size picture, where the first book on that shelf ends (it spans about 1090–1130), so the four boxes look shifted right by about one book. Books 18, 19 and 17 look shifted up and left by roughly 15–25 half-size px. |
| Regularity | Books 4–8 are evenly spaced at about 47 px, and Books 22–25 and 26–29 at 88 px. Measured books are rarely that regular, which suggests the numbers were generated, not measured. This is a suspicion, not a finding. |
| Coverage | 29 of the roughly 45 visible books. Not covered: the two wall shelves in the middle (about 8 books), most of the books on the front-left round table (about 5), the two books leaning on the centre table, the bookcase below the right-wall shelves (about 7) and the books on the floor beyond Book 17. |

What this means:

- **The format is right** (master pixels, one rectangle per book), so the pipeline in this spec works with it as is.
- **The numbers are not yet trustworthy.** They are a first pass for the check loop, not a finished map. The loop in *The check loop* will find the real errors, but the implementer must not start from a list that already fails criteria 4 and 25.
- **Every visible book was to become a link** (decided 2026-10-25), so the list is about 16 short.
- **The small shelf books are a design decision, not only a data fix.** See Open Question 5.

### Third list: "The Abbey", hand-measured with the box editor (2026-10-25)

The author re-measured every box on the master and sent 29 new rectangles in the same format (`[x1, y1, x2, y2]`, master pixels, 2752×1536), for the same scene (`abbey`, "The Abbey"). The measuring was done in the box editor in `mockups/abbey-display/`: it draws a box over the picture, lets the author move and resize it, shows the cursor position in master pixels and exports the array. That mockup is a throwaway measuring aid. It is not part of the product, and nothing in this spec depends on it. The numbers are stored in *Appendix: Abbey coordinates* and replace the earlier ones. They are **measured**, but no one has compared them with the picture under `?hotspots=1` yet (criterion 26).

**Checks done by hand on the numbers** (the automated checks in criteria 3–6 and 25 are the authority):

| Check | Result |
|---|---|
| Format | OK. 29 entries numbered 1–29, all inside 2752×1536, all with positive width and height. |
| Silhouettes overlap (criterion 4) | None found between neighbouring boxes. The Book 2 / Book 10 overlap of the second list is gone. |
| Size and spacing at the 808px breakpoint (criterion 25, 0.294 CSS px per master px) | The smallest boxes are 62 px wide (Books 4 and 14) and 80 px tall (Book 8), about 18×23 CSS px, so they rely on the spacing rule in BD #13. The tightest pair is **Books 8 and 9: centres 80 master px apart, about 23.5 CSS px, just under 24.** Next are Books 27 and 28 (about 24.8) and Books 24 and 25 (about 25.0). Every other neighbouring pair is further apart. At about 826px of scene width Books 8 and 9 also pass (24 ÷ 80 × 2752). The tester computes all 29 exactly. |
| Agreement with the earlier lists | The earlier lists were wrong in places, as suspected. Against the first list, Book 1 moved by up to 34 px (top edge) and Book 13 by about 19 px in x. Against the second list, Books 4–10 moved a long way (from a front-left row at about y 1185 and two window sills to the middle wall shelves) and Books 22–25 moved about 75 px to the left. |
| Coverage | **29 of about 45 visible books.** Books 4–10 (x 1228–1563, y 355–623) now sit where the middle wall shelves are, which the earlier list did not cover. This is an inference from the coordinates and the half-size picture, so confirm it. On the upper row the pitch jumps from 87 px (Books 4 to 5) to 170 px (Books 5 to 6), so one book may be missing between Books 5 and 6. Still not covered: most of the front-left round table (about 5 books), the two books leaning on the centre table, the bookcase under the right-wall shelves (about 7) and the floor books beyond Book 17. |

What this means:

- **The numbers are usable as the starting point for the check loop.** They meet the format and the overlap rule, and Books 8 and 9 are the only pair near the size limit.
- **The small-shelf-books question (Open Question 5) is mostly moot,** because the packed front-row books are gone.
- **Completeness is deferred (Open Question 4).** Books that are added later get slots 30 and up, so the existing slot numbers and Tab order don't change.
## Data Model

### Scenes live in code

```ts
// Illustrative — src/components/bookshop/scenes/index.ts and one file per scene
type Scene = {
  id: string;        // kebab-case, unique. URL segment, file prefix and Placement.sceneId.
  name: string;      // switcher label
  alt: string;       // alt text of the artwork
  artwork: {
    version: string;                          // changes whenever the master changes, e.g. "v1"
    master: string;                           // repo-relative path of the master image, for the asset script and tests
    size: { width: number; height: number };  // master's intrinsic pixels
    widths: readonly [number, number, number]; // 50%, 75% and 100% of the master width, rounded
  };
  hotspots: readonly Hotspot[];               // slots 1..N, N = hotspots.length
};
export const SCENES: readonly Scene[];        // registry order is switcher order
export const DEFAULT_SCENE_ID: "bookshop";
export function getScene(id: string): Scene | undefined;
```

- **The existing scene becomes `bookshop`**, with its data unchanged: `ARTWORK_VERSION` `"v1"`, size 2752×1536, widths `[1376, 2064, 2752]` and today's 25 hotspots.
- `Hotspot` keeps its shape (`slot`, `rect`, `shape`). `zone` becomes an optional free `string`: it is descriptive only, and the union of bookshop zones does not fit other pictures.
- The single exports `HOTSPOTS`, `ARTWORK_VERSION`, `ARTWORK_SIZE` and `ARTWORK_WIDTHS` are replaced by the `Scene` object. `shapePoints`, `shapeClipPath` and the `Hotspot`/`Point` types stay.
- **N is not fixed at 25.** Each scene has as many hotspots as it has traced books. The existing "25" in copy and tests comes from the data.

### Placement replaces `Book.displaySlot` — schema change

```prisma
// Illustrative sketch — not final schema.
model Book {
  // …all current fields except displaySlot…
  placements Placement[]
}

model Placement {
  id      String @id @default(cuid())
  sceneId String            // matches Scene.id. Not a foreign key: scenes live in code.
  slot    Int               // 1..N for that scene. CHECK (slot >= 1) in the migration.
  bookId  String
  book    Book   @relation(fields: [bookId], references: [id], onDelete: Cascade)

  @@unique([sceneId, slot])
  @@unique([sceneId, bookId])
  @@index([bookId])
}
```

- **Migration (required, one new Prisma migration):** create `Placement`; copy every `Book` with a non-null `displaySlot` into `Placement` with `sceneId = 'bookshop'`; then drop `Book.displaySlot`, its unique index and its `1–25` CHECK. The copy is lossless and runs in the same migration, so the existing layout survives.
- **Upper bound of `slot`:** the database can't know how many hotspots a scene has. It enforces `slot >= 1`, and a test compares each scene's placements to its hotspot count (criterion 9). This replaces the `1–25` CHECK.
- **Same book in two scenes** is allowed (different `sceneId`). **Same book twice in one scene** is not (`@@unique([sceneId, bookId])`), because each book gets one link per scene.
- **Why not keep `displaySlot` and add a table for the other scenes:** two sources of truth for "where is this book", and the default scene would need special cases everywhere. The cost of the clean change is one migration and edits to the seed, the loader and the tests that set `displaySlot`.
- **Why not a column per scene on `Book`** (`displaySlotCafe`, …): a schema migration for every new picture.
- **Why `sceneId` is a string and not an enum or a table:** scenes are code. A table would need a seed row, and an enum a migration, for each picture, and neither would prove the hotspot data exists.

### Seed

`prisma/seed.ts` places books into every scene in `SCENES`:

- The default scene keeps today's `SHUFFLE_SEED`, so its book-to-slot mapping does not change.
- Every other scene shuffles its own slots `1..N` with a fixed seed derived from its registry position, so reseeding never moves books and every environment gets the same layout.
- **The catalog is no longer fixed at 25 (decided 2026-10-25).** Every mapped book in a scene becomes a link (the Abbey ships with 29 of its roughly 45 visible books mapped, and the rest may be added later), and the gothic scene is a **different store with its own books** (decided 2026-10-25). The seed therefore keeps the original 25 placeholder books for `bookshop` and adds **one new placeholder book per Abbey hotspot** (29 now, more if books are mapped later). The two sets do not overlap.
- **The added books are obviously fake.** Title `Abbey Placeholder 01`, `02`, …, author `Placeholder Author`, slug `abbey-placeholder-01`, …, short neutral placeholder text in every long-form field, and the same fake `affiliateUrl` (`#affiliate-pending`) as today. They are stand-ins that a later reseed replaces with the real titles, with no code change. `popularityRank` continues from 26 upwards. The existing placeholder-copy trade-off in [book-detail-page.md](book-detail-page.md) applies.
- **Which books go to which scene:** `bookshop` keeps exactly the 25 books and slots it has today. Each other scene has its own list of books in the seed, placed in a fixed shuffle of that scene's slots `1..N`, with a seed derived from its registry position. A scene whose list is shorter than `N` leaves the extra slots empty (the existing "partial" state). The schema still allows one book in two scenes, but the seed doesn't use that.
- Re-running the seed is safe, as today.

### Artwork files

`public/bookshop/<sceneId>@<version>-<width>.webp`. The three widths are 50%, 75% and 100% of the master width, rounded to whole pixels, all lossless WebP, as in [bookshop-display.md](bookshop-display.md) *Assets*.

- **Rename (breaking, internal):** `scene@v1-*.webp` becomes `bookshop@v1-*.webp`. Regenerating with the script produces them, and the old files are deleted.
- **Masters:** `bookshop` uses `docs/scenes/bookstore display.png` (see *Inputs received*). New masters go in `docs/scenes/<sceneId>.<ext>`. The path is stored on the scene (`artwork.master`), so no file has to be renamed.
- **Requirement:** each master is a PNG or JPEG at least 1920px wide, so a scene at the 1920px cap is never enlarged on a pixel-density-1 screen. If a new master is narrower, raise it with the architect.
- `scripts/make-scene-assets.mjs` takes a scene id, reads that scene's master path, version and widths from the registry (run through `tsx`, which is already a dev dependency) and writes only that scene's files. With no id it does all scenes. The box-filter resampling and the lossless WebP settings do not change.

## API Contracts

There are no Server Actions and no route handlers. Data changes only through the seed.

### `getDisplayBooks(sceneId)` in `src/server/display.ts`

- **Input:** `sceneId: string`. The caller has already checked it against the registry. The loader does not trust it blindly: it returns an empty list for an id with no placements.
- **Output:** unchanged: `{ books: DisplayBook[] }` with `DisplayBook = { slot, slug, title, author }`, sorted by slot, 0–N entries.
- **Behaviour:** selects placements where `sceneId` matches, joined to the book, and returns only those four fields. Long-form copy is never sent to a scene page.
- **Errors:** database errors go to the route's `error.tsx`, as today.
- **Auth:** none. Public content.

### Route inputs

- **`[scene]` path segment:** validated with Zod as a registry id, `z.enum(SCENES.map(s => s.id))` (illustrative). Anything else, including path-like values such as `../x`, is "not found" and makes no database query.
- **`hotspots` search param:** unchanged: `z.enum(["1"]).optional()`, effective only when `NODE_ENV !== "production"`.

## UI Surface

### Routes

| Route | Renders | Notes |
|---|---|---|
| `/` | the `bookshop` scene | unchanged URL and content |
| `/shops/[scene]` | the scene with that id | new. Unknown id: the app's not-found page |
| `/shops/bookshop` | redirects to `/` (permanent) | one URL per scene; no duplicate content |
| `/books/[slug]` | unchanged | still backed by `bookshop@v1-1376.webp` as the backdrop |

Both pages are Server Components, dynamic, with no `loading.tsx` and no Suspense around the scene (the existing reasons in [bookshop-display.md](bookshop-display.md) *States → Loading* apply to every scene). They share one server component, for example `<ShopPage scene books showOverlay>`, so the toolbar, scene and empty state are written once. The implementer must read the Next.js docs in `node_modules/next/dist/docs/` before writing the dynamic route and the redirect, as `AGENTS.md` requires.

### Toolbar and scene switcher

- The toolbar row stays 64px high and in its own row above the scene (it never overlaps the artwork). It gains a left-hand region with the switcher, and the drawer button stays right-aligned.
- **`<nav aria-label="Shops">`** with one `<a>` per scene in registry order: `/` for the default scene, `/shops/{id}` for the others. The current scene's link has `aria-current="page"`. Plain links, so it works without JS, middle-click opens a new tab, and crawlers can follow it.
- **Shown only when there is more than one scene.**
- **It never wraps and never makes the toolbar taller.** If the links don't fit (narrow screens, many scenes), the switcher scrolls sideways inside its own region. The drawer button stays visible at every width.
- **DOM order:** switcher first, then the drawer button.
- Focus style follows the page's existing focus style and meets 3:1 against its background.

### Scene component

`<BookshopScene>` takes the `scene` as well as the books and the overlay flag. Everything that was fixed to 2752×1536 comes from `scene.artwork`:

- **Aspect ratio:** `aspect-ratio` and the `width`/`height` attributes come from `scene.artwork.size`, set as CSS custom properties on the scene (unitless width and height numbers), so there is no layout shift.
- **Fit the window:** the scene's width is still `min(content width, (100dvh − 96px) × width/height, 1920px)`, using the scene's own ratio. The 96px stays one shared value.
- **`srcset` and `sizes`:** `srcset` lists the scene's three files with their widths. `sizes` is built from the same rule: `min(calc(100vw − 32px), calc((100vh − 96px) × width/height), 1920px)`. It is computed per scene, not a constant.
- **Alt text** is `scene.alt`.
- **Hotspots** come from `scene.hotspots`, and the books from `getDisplayBooks(scene.id)`. Everything else (links, the edge and focus-ring svgs, the label, the failed-image state, the overlay) is unchanged.
- **Breakpoint:** one global value for all scenes, still 808px of scene width, as a container query on the scene. A container query's condition can't read a custom property, so a per-scene breakpoint would need per-scene CSS. If any scene fails criterion 21 at 808px, the global value goes up and the spec is updated, as [bookshop-display.md](bookshop-display.md) already says. A scene full of large books pays for another scene's small ones. We accept that for one rule everywhere.

### Drawer

Unchanged. It lists the current scene's books ("All {N} on display"), so the count and links are per scene.

### States

Per scene, as in [bookshop-display.md](bookshop-display.md): **empty** (no placements: artwork, no hotspots, no drawer button, the "being rearranged" message, switcher still visible), **partial** (empty slots are absent) and **image fails** (hotspots hidden, drawer and switcher still work).

## Acceptance Criteria

"Every scene" means every entry in `SCENES`. Criteria from [bookshop-display.md](bookshop-display.md) are cited as *BD #n*.

### Scene data

1. `SCENES` has unique, kebab-case ids and starts with `bookshop`, whose hotspots, size (2752×1536), version (`v1`) and widths are identical to today's values. Every scene has a non-empty `name` and `alt`, and no two scenes share an `alt`.
2. Every scene's slots are exactly 1..N with no gaps or repeats, with N ≥ 1.
3. Every scene's `rect` stays within 0–100 on both axes with positive size, and every `shape` has 3 or more points, every coordinate within 0–100, non-zero area and no self-crossing edges. (Extends BD #2 and #28.)
4. In every scene, no two silhouettes overlap when each `shape` is mapped back to artwork coordinates. Overlapping bounding rectangles are allowed. (Replaces BD #3.)
5. `hotspotFromPixels` for a polygon returns a `rect` that contains the whole polygon, rounded outwards to 0.1, and a `shape` that maps back to the input points within 0.5 master px. A rectangle input gives a 4-point shape. The same polygon given in a 1920×1080 space and in the equivalent 2752×1536 space (each coordinate scaled by the same factor on each axis) gives the same `Hotspot`, within the 0.1 rounding. It throws for a point outside `space`, fewer than 3 points, zero area, or a `space` whose aspect ratio differs from the master's by more than 1%.
6. For every scene:
   - The file at `artwork.master` exists (PNG or JPEG) and its header size equals `artwork.size`, with width of at least 1920.
   - `artwork.widths` equals 50%, 75% and 100% of the master width (rounded).
   - `public/bookshop/<id>@<version>-<width>.webp` exists for each width, is lossless (VP8L) and has exactly the size implied by the master's aspect ratio. (Extends BD #11 and #12.)
7. `npm run assets:scene -- <id>` regenerates only that scene's three files, and the result meets criterion 6. Without an id it regenerates all scenes.
8. `getScene(id)` returns the scene for each registered id and `undefined` for anything else, including `""`, `__proto__`, `constructor` and ids with different casing.

### Database and seed

9. For every scene, the number of placements is at most N and every placement's slot is within 1..N. After seeding, the `abbey` scene has exactly N placements (no empty slot), `bookshop` has 25, and no book is placed in both scenes. The books added beyond the original 25 have unique slugs and unique `popularityRank` values.
10. `Placement` rejects a second row with the same (`sceneId`, `slot`), a second row with the same (`sceneId`, `bookId`) and a `slot` below 1. The same book can be placed in two different scenes. Deleting a book deletes its placements.
11. After the migration is applied to a database seeded under the old schema, `getDisplayBooks("bookshop")` returns exactly the list it returned before (same books, same slots), and `Book` has no `displaySlot` column.
12. After `prisma db seed`, running it a second time gives the same book-to-slot mapping in every scene. In `bookshop` the mapping is identical to the one before this change (BD #25's fixed shuffle): the same 25 books in the same slots, and none of the added books appear there.

### Routes

13. `GET /` returns the `bookshop` scene exactly as before: one `<a href="/books/{slug}">` per placed book, accessible name "{title} by {author}", no client JS needed (BD #1).
14. `GET /shops/{id}` for each other scene returns server-rendered HTML with that scene's artwork (`srcset` listing that scene's three files, and its `alt`) and one link per book placed in that scene, with no client JS needed.
15. `GET /shops/bookshop` returns a permanent redirect to `/`.
16. `GET /shops/{unknown}` returns the not-found page with status 404, and so does a path-like value such as `..%2Fx`. Neither runs a database query for a placement.
17. `/shops/{id}?hotspots=1` outlines all of that scene's rectangles with slot numbers and its silhouettes in a non-production build, and renders the normal page in a production build. (Extends BD #18.)
18. A book placed in two scenes links to the same `/books/{slug}` from both.
19. The book detail page is unchanged: its backdrop requests `bookshop@v1-1376.webp`, and "Back to the shop" goes to `/` (extends book-detail-page criteria 11 and 23).

### Switcher and drawer

20. With more than one scene, the page has a `nav` named "Shops" with one link per scene in registry order, the current one marked `aria-current="page"`. The links work without JS. With one scene, there is no such `nav`.
21. At 375px, 768px and 1440px wide, the toolbar stays 64px high, the switcher and the drawer button don't overlap each other or the scene, and every switcher link can be reached by keyboard (scrolling the switcher into view if needed). The switcher comes before the drawer button in tab order.
22. The drawer and its button show only the current scene's books and count. The sidebar list matches the hotspots' links and order (BD #15).

### Layout and fit

23. For every scene, the scene element's aspect ratio is `artwork.size.width : artwork.size.height` before the image loads, with zero layout shift, and its width is the smallest of the content width, `(viewport height − 96px) × width/height` and 1920px, within 1px, at the viewport sizes in BD #26, #36 and #37. The page doesn't scroll in either direction, and the toolbar doesn't overlap the scene. (Extends BD #12, #26, #36 and #37 to every scene's own ratio.)
24. For every scene, the browser loads the smallest served file that is at least as wide as the scene's rendered width times the pixel density, or the largest file if none is. Test at 375×812 @2x, 1440×900 @1x and 1440×900 @2x. (Extends BD #27.)
25. **Breakpoint and target size.** For every scene, the hotspots, edges and focus rings are shown when the scene is at least 808px wide and are hidden, unfocusable and out of the accessibility tree when it is narrower (BD #14, #38). While shown, every hotspot meets WCAG 2.5.8 as BD #13 defines it, at scene widths 808px, 1280px and 1920px.

### Calibration (manual, by the tester)

26. For every scene other than `bookshop`, at 1440px and 1024px, with `?hotspots=1` on and again with it off, every book's edge sits on that book's visible outline in the artwork, to within about 3 CSS px at the 1920px size (±4 master px). A gap, an overhang or an edge on the wrong book is filed in `docs/bugs/` with the slot number and direction. **A scene has no open calibration bug when it is released.** (Extends BD #21 and #35.)

### Behaviours carried over

27. For every scene, BD #6–#10, #29–#34 and #8's label clamp hold: hover and focus labels, silhouette hit area, edge and focus-ring markup, keyboard focus, Tab order 1→N, reduced motion. The scene-independent parts of BD (the drawer's popover focus behaviour, BD #22–#23, and the no-JS drawer) are tested once on the default scene, because they don't read the scene's data.
28. Test cost rule: tests that depend on a scene's geometry (criteria 3–6, 13–14, 23–25, the label clamp and the sampled hit-area checks for the first, middle and last slot) run for every scene. Behaviour tests that don't (drawer, edge animation, reduced motion) run once on `bookshop`. The tester may widen this if a scene needs it.

## Risks and Trade-offs

- **The coordinates are the whole risk.** More scenes means more hand-measured polygons, and each one fails visibly if it's off. The decision to author in master pixels, derive the percentages in code, and gate release on criterion 26 limits the damage, but does not remove the manual comparison. It's the cheapest check that works on painted art.
- **Aspect ratios may differ.** The current scene and the gothic JPEG are both 2752×1536. If a later picture has a different ratio, the page fills the window differently: a wider picture gets a smaller scene on short windows. The size rule handles any ratio, but a very tall picture would make a very narrow scene, which hides its hotspots (criterion 25).
- **One global breakpoint.** It is simple, and it matches the container query's limit, but the scene with the smallest books sets it for every scene. The other option, a per-scene breakpoint, needs generated CSS per scene. Not chosen.
- **A scene with many hotspots costs paint time.** Each displayed book has an animated edge. At 25 books that is already accepted in [bookshop-display.md](bookshop-display.md). The Abbey has 29 books in the current list (about 45 if every visible book is mapped), against the bookshop's 25, so it costs between the same and about twice as much. If profiling shows jank, the existing order of cuts applies (glint first, then glow, then keep the static edge). A cap on N is not set; ask if a scene is expected to go far past 25.
- **Placement replaces a column.** Every test that sets `displaySlot` (the integration tests, the e2e support code, the book-detail fixtures) changes, and `getDisplayBooks()` gains a parameter. That is mechanical, and criterion 11 proves the data survived. A half-way state (column and table together) was rejected.
- **The schema allows a book in several scenes, the seed doesn't use it.** The stores are separate, so each has its own books today. The flexibility costs nothing (one unique index covers it) and avoids a migration if a book ever appears in two stores. If it should be forbidden, add a unique index on `bookId` alone.
- **The switcher can outgrow the toolbar.** It scrolls instead of wrapping, so a keyboard reader may have to tab into off-screen links. Acceptable with a handful of scenes. If the list grows, move it into the drawer.
- **One URL per scene.** `/shops/bookshop` redirects, so the default scene has no duplicate. A random scene at `/` was not chosen, for the reasons the display spec gave against a per-visit reshuffle: it breaks caching, makes bugs hard to reproduce and gives each visitor a different landing page.
- **Masters may be JPEGs, or PNGs converted from JPEGs.** A PNG made from a JPEG is lossless in name only: the artifacts are already in it. Check each master at 400% zoom for colour noise round the edges. If it's there, either accept it or re-export from the source; it's not a code change.
- **Lossless WebP of a JPEG-origin picture can be heavy.** Noise makes lossless files bigger. The existing weight check (a 2064px file over 3 MB goes back to the architect) applies to every scene. If a scene fails it, the decision is between accepting the weight and a spec change to allow lossy WebP for that scene. We have not made that change.
- **Repo weight.** Each scene adds a master of several MB in `docs/` and about 12–15 MB of served WebP in three sizes. Fine for a handful of scenes. Revisit if there are dozens.
- **We deliberately did not** build a polygon editor, an automatic outline detector, or a runtime scene loader. Each is a large piece of work for an artwork set that changes rarely.

## Breaking Changes

- **Schema:** `Book.displaySlot` is removed and `Placement` is added, in one migration that copies the existing placements. Any code, seed or test that reads or writes `displaySlot` must change.
- **Internal modules:** `HOTSPOTS`, `ARTWORK_VERSION`, `ARTWORK_SIZE` and `ARTWORK_WIDTHS` are replaced by the `Scene` registry. Known importers: `src/components/book/BookShell.tsx` (the backdrop, which uses the default scene's smallest file), `src/components/bookshop/BookshopScene.tsx`, `src/components/bookshop/hotspots.test.ts`, `src/components/bookshop/hotspot-shapes.test.ts` and the e2e specs in `tests/e2e/`.
- **Loader:** `getDisplayBooks()` becomes `getDisplayBooks(sceneId)`. Its output shape is unchanged.
- **Files:** `public/bookshop/scene@v1-*.webp` is renamed `bookshop@v1-*.webp`. Anything that requests the old URL (`BookShell`, e2e selectors such as `img[srcset*="/bookshop/scene@"]`, the `SERVED_PATH` regex) must change.
- **Public routes:** `/` and `/books/[slug]` are unchanged. `/shops/[scene]` is new. No external contract changes.
- **Superseded:** [bookshop-display.md](bookshop-display.md)'s out-of-scope line about more than one scene, its criterion 3 (now about silhouettes, see criterion 4 above), and its fixed "25" for the number of hotspots. That spec still describes how a single scene looks and behaves.
- **Tests that assume one scene or 25 hotspots** need updating: `tests/integration/bookshop-display.db.test.ts` (slot range, the 25-title fixture), `tests/e2e/support/db.ts`, `tests/e2e/support/book-fixtures.ts`, and the "precondition: the seed places 25 books" checks in the bookshop e2e specs.

## Open Questions

Blocking:

1. **Decided (2026-10-25): different stores.** The Abbey is a different store with its own books, not another view of the bookshop. Its books are placeholders for now (see *Seed*). Nothing further needed unless the real catalog will be larger than the number of hotspots.
2. **Decided (2026-10-25): the Abbey's master is 2752×1536.** (The earlier "2572" was a typo.) Its ratio is 1.792:1, the same as the bookshop's. The implementer still checks the file header against `artwork.size` (criterion 6).
3. **Decided (2026-10-25): re-measured by hand.** The author measured all 29 boxes on the master with the box editor (see *Third list*). They go through the check loop and criterion 26 like every scene, and the earlier lists are discarded.
4. **Decided (2026-10-25): the Abbey ships with the 29 mapped books, and the alt text is "The abbey's library".** The unmapped books (about 16: the front-left round table, the two books leaning on the centre table, the bookcase under the right-wall shelves, the floor books, and possibly one on the upper wall shelf between Books 5 and 6) are not links for now. The author may add them later. Adding books later takes no schema change and no code change: append their boxes as slots 30 and up in the Abbey's data, add one placeholder book per new slot to the seed (same naming, slugs and `popularityRank` rule as in *Seed*), and run the check loop for the new boxes. The existing slot numbers and Tab order don't change. The alt text is the author's wording, used exactly. It names the place rather than describing the picture, which is enough to meet criterion 1 (non-empty and unique), and the author may lengthen it later.
5. **Mostly resolved (2026-10-25): the small shelf books.** The packed front-row books (old Books 4–8) are no longer in the list. In the new list only Books 8 and 9 come near the limit, at about 23.5 CSS px apart at 808px. Nothing is decided now: the tester computes criterion 25 for the final list, and if Books 8 and 9 fail, the rule in *UI Surface* applies and the global breakpoint rises to about 826px. A per-scene breakpoint and merging books into one link are no longer proposed.
6. **Decided (2026-10-25): placeholders and name.** The implementer adds the placeholder books described under *Seed*, one per Abbey hotspot. The scene is named "The Abbey".

Non-blocking:

7. **Landing page.** Should `/` always show `bookshop` (as specified), or should another scene be the default?
8. **Cursor readout.** The overlay could show the cursor position in master pixels while `?hotspots=1` is on, so a wrong vertex can be fixed with exact numbers. The measuring mockup already does this. A dev-only client component in the real overlay is small, but it is not in scope unless you want it.
9. **Size cap.** Still open from [bookshop-display.md](bookshop-display.md): 1920px, 2752px or no cap. It applies to every scene.
10. **Empty-state height.** Also still open from that spec, and it applies per scene.

## Appendix: Abbey coordinates

Hand-measured by the author on 2026-10-25 with the box editor, **not yet checked by the tester** (criterion 26). Master `docs/scenes/gothic.png`, 2752×1536, `[x1, y1, x2, y2]` in master pixels. The slot is the book's number. Descriptions are approximate and inferred from position, so they are only there to help find a book. This is input for the implementer, not a file the app reads. A rectangle becomes `x = x1`, `y = y1`, `width = x2 − x1`, `height = y2 − y1`.

| Slot | Description | x1 | y1 | x2 | y2 |
|---|---|---|---|---|---|
| 1 | easel, far left | 330 | 843 | 443 | 970 |
| 2 | easel, middle | 470 | 814 | 578 | 933 |
| 3 | easel, right | 601 | 769 | 718 | 888 |
| 4 | middle wall shelf, upper row, 1st | 1228 | 373 | 1290 | 455 |
| 5 | middle wall shelf, upper row, 2nd | 1310 | 355 | 1382 | 455 |
| 6 | middle wall shelf, upper row, 3rd | 1481 | 369 | 1552 | 455 |
| 7 | middle wall shelf, lower row, 1st | 1235 | 527 | 1312 | 621 |
| 8 | middle wall shelf, lower row, 2nd | 1327 | 543 | 1394 | 623 |
| 9 | middle wall shelf, lower row, 3rd | 1405 | 537 | 1476 | 623 |
| 10 | middle wall shelf, lower row, 4th | 1493 | 533 | 1563 | 615 |
| 11 | leaning, left on low round table | 761 | 968 | 865 | 1089 |
| 12 | leaning, right on low round table | 951 | 964 | 1052 | 1103 |
| 13 | central table, top tier, on easel | 1440 | 769 | 1540 | 894 |
| 14 | central table, middle tier, left | 1351 | 943 | 1413 | 1046 |
| 15 | central table, middle tier, centre | 1454 | 958 | 1520 | 1054 |
| 16 | central table, middle tier, right | 1548 | 943 | 1620 | 1046 |
| 17 | central table, bottom tier, flat in box | 1437 | 1355 | 1600 | 1448 |
| 18 | large easel, top-left on the table | 2086 | 937 | 2229 | 1120 |
| 19 | lower ledge, far left | 1903 | 1200 | 2010 | 1355 |
| 20 | lower ledge, middle left | 2044 | 1237 | 2157 | 1386 |
| 21 | lower ledge, right | 2235 | 1226 | 2366 | 1376 |
| 22 | far-right shelf 1, left | 2180 | 492 | 2262 | 597 |
| 23 | far-right shelf 1, centre | 2281 | 503 | 2349 | 594 |
| 24 | far-right shelf 1, right | 2375 | 509 | 2442 | 599 |
| 25 | far-right shelf 1, far right | 2460 | 509 | 2527 | 599 |
| 26 | far-right shelf 2, left | 2186 | 675 | 2255 | 770 |
| 27 | far-right shelf 2, centre-left | 2278 | 669 | 2348 | 764 |
| 28 | far-right shelf 2, centre-right | 2363 | 673 | 2432 | 768 |
| 29 | far-right shelf 2, right | 2456 | 675 | 2526 | 768 |
