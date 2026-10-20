# Visual Direction

## Goal

Give the designer a fixed, shared starting point — one token palette, three layout geometries, and one sample content set — so that three mockups under `mockups/**` can be compared side by side and judged purely on design. After this ships, we can look at three concepts that differ only in geometry and motion, pick one, and hand it back to the architect to be specified as a real feature.

## Scope

**In scope**

- A design token set (colour, typography, spacing, radius, elevation, motion) expressed as CSS custom properties, with light and dark values.
- Three named layout geometries for the tree, each to be built as its own self-contained mockup folder.
- One canonical sample content set, hard-coded identically into every mockup.
- The shared interaction contract every concept must honour (expand/collapse, keyboard, focus, reduced motion).
- The review checklist used to compare concepts.

**Out of scope**

- Any code in `src/**`, any Prisma model, any route, any Server Action.
- Real data, authentication, search, book metadata fetching, covers from a remote source.
- Picking a winner. That is a human decision after the mockups exist.
- Web fonts, npm packages, build steps, icon libraries. Mockups must open by double-clicking `index.html`.

## Data Model

No database changes. This spec produces no migration.

**A book can sit on more than one shelf.** Shelves themselves have exactly one parent. So the structure is a tree of shelves with books hanging off it — a shallow DAG, not a pure tree. The real many-to-many model is a later spec's problem; what matters here is that the geometries must cope with the same book appearing in two places.

The sample content set is hard-coded inline in each mockup. It is shaped to mirror the eventual domain so the mockups do not mislead us:

```ts
// Illustrative only — do not implement.
type SampleNode = {
  id: string;          // stable; the SAME book id appears under every shelf it sits on
  title: string;
  kind: "shelf" | "book";
  href: string;        // every node is a real link; identical for every instance of a book
  author?: string;     // books only
  year?: number;       // books only
  children?: SampleNode[];  // shelves only
};
```

A book that sits on two shelves is authored twice in the markup, once under each parent, carrying the same `id` and `href`. Each occurrence is an *instance* of one book, not a copy of it — see the cross-instance rules under Shared substrate.

### Sample content set

Use exactly this tree in every concept. Do not add, rename, or reorder nodes — differences in copy make the comparison worthless. Every node is a real `<a href>`; `href` values are placeholder fragments (`#/shelf/...`, `#/book/...`).

```
Tree of Books                                     (root, shelf)
├── Fiction                                       (shelf)
│   ├── Novels                                    (shelf)
│   │   ├── Middlemarch — George Eliot, 1872
│   │   ├── The Remains of the Day — Kazuo Ishiguro, 1989
│   │   ├── A Brief History of Seven Killings — Marlon James, 2014
│   │   ├── The Unbearable Lightness of Being — Milan Kundera, 1984
│   │   ├── Wolf Hall — Hilary Mantel, 2009
│   │   ├── Beloved — Toni Morrison, 1987
│   │   ├── Gilead — Marilynne Robinson, 2004
│   │   └── The Overstory — Richard Powers, 2018        ← also on Science
│   ├── Short Stories                             (shelf)
│   │   └── Dubliners — James Joyce, 1914        (single-child branch)
│   └── Speculative                               (shelf)
│       ├── Translation State — Ann Leckie, 2023
│       └── Deep Cuts                             (shelf)
│           └── Forgotten Imprints                (shelf)
│               └── Very Deep                     (shelf)
│                   └── The Autobiography of Red: A Novel in Verse, and Other Long-Titled Works That Will Not Fit On One Line — Anne Carson, 1998
├── Non-fiction                                   (shelf)
│   ├── History                                   (shelf)
│   │   ├── The Silk Roads — Peter Frankopan, 2015
│   │   └── SPQR — Mary Beard, 2015
│   ├── Science                                   (shelf)
│   │   ├── The Sixth Extinction — Elizabeth Kolbert, 2014
│   │   ├── Entangled Life — Merlin Sheldrake, 2020
│   │   └── The Overstory — Richard Powers, 2018        ← also on Fiction › Novels
│   └── Essays                                    (shelf)
│       └── Upstream — Mary Oliver, 2016                ← also on Poetry
├── Poetry                                        (shelf)
│   ├── Ariel — Sylvia Plath, 1965
│   ├── Devotions — Mary Oliver, 2017
│   └── Upstream — Mary Oliver, 2016                    ← also on Non-fiction › Essays
└── Unsorted                                      (shelf, EMPTY — must render an empty state)
```

Why this shape: `Novels` forces the design to cope with eight siblings; `Short Stories` tests a branch with exactly one child; the `Speculative → Deep Cuts → Forgotten Imprints → Very Deep` chain reaches depth 5 and carries a deliberately overlong title; `Unsorted` forces an empty-branch state.

The two multi-shelf books are the deliberate stress case. *The Overstory* crosses the top-level Fiction/Non-fiction divide — the longest possible jump in this set. *Upstream* sits on two shelves that are close together, so the two instances can be on screen at once. Between them they cover both the far and the near case for whatever cross-instance treatment each geometry chooses.

## API Contracts

None. No Server Actions, no route handlers, no fetches. All interaction is local, vanilla JS over the inline markup.

## UI Surface

### Deliverables

| Path | Concept |
|------|---------|
| `mockups/outline/index.html` | Geometry A — Indented Outline |
| `mockups/branching/index.html` | Geometry B — Horizontal Branching Tree |
| `mockups/orbit/index.html` | Geometry C — Radial Orbit |

Each folder is self-contained: `index.html`, `styles.css`, `app.js`, and a `tokens.css` copied verbatim into each folder (no shared parent file — the folders must survive being moved or deleted independently).

### Shared substrate (all three concepts)

- The document markup is a nested `<ul>` / `<li>` of real `<a>` elements, authored in source order matching the sample tree. The geometry is applied on top with CSS; it never replaces the list.
- Shelves use `<button aria-expanded>` for the disclosure control; the shelf title itself stays a link.
- Collapsed subtrees are hidden with `hidden`/`display:none`, not clipped off-screen.
- **Cross-instance rule.** A book on two shelves is authored under both, with the same `id` and `href`. Hovering or focusing one instance must make the other instance identifiable — the concept chooses how (a shared tint, a connector, a marker, a count badge in `--color-highlight`). Whatever it chooses must also work when the sibling instance is off-screen or inside a collapsed branch, and must degrade to *something* static so a book's multi-shelf status is not hover-only.
- A book instance carries `data-book-id`; duplicates are found by that, not by title text.
- Keyboard: `Tab` moves through links in document order; `ArrowRight` expands, `ArrowLeft` collapses, `ArrowDown`/`ArrowUp` move between visible nodes, `Enter` follows the link.
- Focus is always visible, using `--focus-ring`, and is never removed by a geometry transform.
- `prefers-reduced-motion: reduce` collapses every transition and transform animation to `0ms`; state still changes, it just arrives instantly.
- `prefers-color-scheme` switches the palette because the tokens already do it for free. Dark is not reviewed and no manual toggle is required \u2014 build the concepts against the light palette.

### Token palette

Copy this into `tokens.css` in each concept folder. Concepts may add concept-local variables, but must not redefine these values — if a concept needs a different colour, that is a finding to report, not a silent edit.

```css
:root {
  /* Paper — surfaces, lightest to deepest */
  --paper-0: #fbf7f0;
  --paper-1: #f3ede3;
  --paper-2: #e8dfd1;
  --paper-3: #d9ccb8;

  /* Ink — text, strongest to faintest */
  --ink-0: #1f1b16;
  --ink-1: #4a423a;
  --ink-2: #7a6f63;

  /* Naturals — structure and accent */
  --bark:  #8b6f4e;   /* connectors, rails, branch strokes */
  --leaf:  #3f7d52;   /* active/expanded state, primary accent */
  --fruit: #b4453a;   /* rare highlight: current node, badge */

  /* Semantic aliases — concepts reference these, not the ramps above */
  --color-bg:          var(--paper-0);
  --color-surface:     var(--paper-1);
  --color-surface-alt: var(--paper-2);
  --color-border:      var(--paper-3);
  --color-text:        var(--ink-0);
  --color-text-muted:  var(--ink-2);
  --color-branch:      var(--bark);
  --color-accent:      var(--leaf);
  --color-highlight:   var(--fruit);
  --focus-ring:        0 0 0 2px var(--color-bg), 0 0 0 4px var(--leaf);

  /* Type — system stacks only, no web fonts */
  --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --font-ui: ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, "Cascadia Mono", Consolas, monospace;

  --text-xs:  0.75rem;    /* 12px — year, meta */
  --text-sm:  0.875rem;   /* 14px — author */
  --text-base:1rem;       /* 16px — book title */
  --text-lg:  1.125rem;   /* 18px — shelf title */
  --text-xl:  1.5rem;     /* 24px — section heading */
  --text-2xl: 2.25rem;    /* 36px — root */

  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --tracking-wide: 0.04em;

  /* Space — 4px base */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Shape */
  --radius-sm: 2px;
  --radius-md: 6px;
  --radius-lg: 12px;
  --radius-pill: 999px;

  /* Elevation — soft, warm, never neutral grey */
  --shadow-sm: 0 1px 2px rgb(31 27 22 / 0.08);
  --shadow-md: 0 4px 12px rgb(31 27 22 / 0.10);
  --shadow-lg: 0 12px 32px rgb(31 27 22 / 0.14);

  /* Motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast: 120ms;
  --dur-base: 220ms;
  --dur-slow: 420ms;

  /* Geometry */
  --rail-width: 1px;
  --node-gap: var(--space-2);
  --indent-step: var(--space-6);
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper-0: #14120f;
    --paper-1: #1c1915;
    --paper-2: #26211a;
    --paper-3: #342d22;

    --ink-0: #f2ede4;
    --ink-1: #cfc6b8;
    --ink-2: #9a9082;

    --bark:  #c09a6b;
    --leaf:  #7fb98d;
    --fruit: #e08a7e;

    --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.40);
    --shadow-md: 0 4px 12px rgb(0 0 0 / 0.48);
    --shadow-lg: 0 12px 32px rgb(0 0 0 / 0.56);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-fast: 0ms;
    --dur-base: 0ms;
    --dur-slow: 0ms;
  }
}
```

### Geometry A — Indented Outline (`mockups/outline/`)

Vertical, top-to-bottom. Each depth level is inset by `--indent-step`. A `--color-branch` rail runs down the left edge of each open subtree, with a short elbow connecting to each child. Disclosure caret rotates on expand. Books show title (`--font-display`, `--text-base`), author (`--text-sm`, `--color-text-muted`), year (`--text-xs`).

- Strength to prove: density and scannability. The whole library should be legible without horizontal scrolling at 1024px, even at depth 5.
- Thing to watch: at depth 5 the overlong title must wrap and stay aligned with its own indent, not the parent's.
- Multi-shelf case: the two instances of *The Overstory* are far apart vertically and may not share a screen. A static marker plus an on-focus way to reach the other instance is likely the honest answer here; say what you chose.
- Motion: expand animates height `--dur-base` `--ease-out`; children stagger in at `--dur-fast` intervals, capped so eight siblings do not take a second to appear.

### Geometry B — Horizontal Branching Tree (`mockups/branching/`)

Root on the left, growth to the right. Each level is a column; curved `--color-branch` connectors (SVG paths or CSS pseudo-elements) join a parent to each child. The canvas pans horizontally; only ancestors of the focused node stay expanded, siblings of ancestors collapse, so the viewport follows the path the reader is on.

- Strength to prove: you can see the *shape* of the library — which branches are thick, which are thin.
- Thing to watch: `Novels` with eight children must not force the column taller than the viewport at 1024px; decide whether to scroll the column or scale it down, and say which you chose.
- Multi-shelf case: this is the geometry where a second connector is actually drawable — a book with two parents can have two curves meeting it. Try it, and report whether it reads as structure or as noise. If it reads as noise, fall back to duplicated nodes with a shared marker and say so.
- Motion: expanding a branch grows its connector from the parent outward, `--dur-slow` `--ease-out`; the pan to re-centre is `--dur-base` `--ease-in-out`.

### Geometry C — Radial Orbit (`mockups/orbit/`)

Root at centre. Each depth is a ring; children are arcs distributed around their parent's angular slice. Clicking a shelf re-roots the view on that shelf, with a breadcrumb back to the top. Labels stay horizontal and legible — never rotate text past readability.

- Strength to prove: breadth at a glance, and a sense of the library as one object.
- Thing to watch: depth 5 plus the overlong title is the hard case. Decide how a label truncates and where the full title appears; say which you chose.
- Multi-shelf case: a node cannot occupy two angular slices at once, so this geometry has to duplicate and link. A chord drawn across the centre between the two instances of *The Overstory* is the obvious move; it is also the one most likely to look like a mistake. Report the verdict either way.
- Motion: re-rooting is a rotate-and-scale transition at `--dur-slow` `--ease-in-out`; hover lifts a node with `--shadow-md`.

### States every concept must show

- **Collapsed** — all shelves closed, root visible.
- **Partially expanded** — the `Speculative → Deep Cuts → Forgotten Imprints → Very Deep` path open to the bottom.
- **Empty branch** — `Unsorted` expanded, showing an empty state ("Nothing shelved here yet") in `--color-text-muted`.
- **Multi-shelf** — both instances of *Upstream* visible at once with the cross-instance treatment active, and the far case (*The Overstory*) shown with its sibling instance off-screen.
- **Focus** — a book node with keyboard focus, `--focus-ring` clearly visible.
- **Hover** — distinct from focus, and never the only indication of anything.

## Acceptance Criteria

1. Three folders exist: `mockups/outline/`, `mockups/branching/`, `mockups/orbit/`, each containing `index.html`, `styles.css`, `app.js`, `tokens.css`.
2. Each `index.html` opens and renders fully from the local filesystem with no server, no network request, and no console error.
3. `tokens.css` in all three folders is byte-identical to the palette block in this spec.
4. Each concept's rendered node set matches the sample content set exactly — same titles, same authors, same years, same parent/child relationships, same order, including both instances of each multi-shelf book.
5. Every node in every concept is an `<a>` with an `href`; every shelf has a control exposing `aria-expanded` that flips between `true` and `false`.
6. With CSS disabled, each `index.html` still reads as a correctly nested list of links in the sample tree's order.
7. `Tab` reaches every visible link; `ArrowRight`/`ArrowLeft` expand and collapse the focused shelf; `ArrowDown`/`ArrowUp` move between visible nodes.
8. Keyboard focus is visible on every focusable element and is not clipped or hidden by any transform the geometry applies.
9. With `prefers-reduced-motion: reduce`, no concept animates: state transitions complete immediately and nothing moves, fades, or scales over time.
10. In the light palette, no text falls below 4.5:1 contrast against its background (3:1 for text at `--text-xl` and above).
11. At 1440px and at 1024px, no concept produces an unintended horizontal scrollbar on the document, and no label is clipped to illegibility. Geometry B's deliberate horizontal pan is the one allowed exception and must be confined to its own scroll container.
12. The depth-5 overlong title renders without overflowing its container, breaking layout, or overlapping a sibling, in all three concepts at both widths.
13. Expanding `Unsorted` shows the empty state; it does not render an empty container or collapse silently.
14. Both instances of *The Overstory* and both instances of *Upstream* share one `data-book-id` and one `href`, and both carry a static indication that the book is shelved more than once — visible without hover or focus.
15. Focusing either instance of *Upstream* identifies the other while both are on screen; focusing either instance of *The Overstory* still gives the reader a way to reach the other when it is off-screen or inside a collapsed branch.
16. No concept loads a web font, an npm package, a CDN script, or any remote image.
17. No file is created or modified outside `mockups/**`.

## Risks and Trade-offs

- **Three concepts is a lot of build.** We deliberately fixed the tokens and content so the only variable is geometry; if the designer finds themselves re-choosing colours, that is scope creep and should be reported back rather than absorbed.
- **Multi-parent books are the real risk in this spec.** A book on two shelves means the structure is not a tree, and every one of these geometries is a tree-drawing idiom. Duplicating a node is the cheap answer but it inflates counts, breaks "collapse all under X", and makes "where am I" ambiguous. Drawing a second edge is honest but B is the only geometry where it has a chance of reading clearly. We are spending mockup time on this precisely because getting it wrong in `src/` would be expensive.
- **Shelves stay single-parent, so cycles are impossible.** If shelves ever gain multiple parents, all three geometries need revisiting and the markup can no longer be a plain nested list.
- **Geometry C is the likeliest to fail.** Radial layouts look good with shallow, even trees and fall apart with one fat branch, one deep chain, and cross-links — which is exactly what the sample set contains. That is intentional: we would rather learn it in a mockup than in `src/`.
- **Mockup fidelity is not implementation fidelity.** Vanilla JS over static markup will do things that are awkward in React with Server Components. The implementer rebuilds the winner from a later spec, so the mockup's internals carry no weight — only its look, motion, and interaction model do.
- **System font stacks drift between platforms.** `--font-display` will render differently on Windows and macOS. We accept this for the mockups; a real web font is a decision for the implementation spec.
- **Warm palette constrains imagery.** The paper/ink/bark ramp assumes no full-bleed cover art. If covers land later, the palette will need a neutral surface added.
- **The sample set is deliberately small.** Eight siblings and depth 5 is not a realistic library. A concept that wins here may still lose at 200 books. We are accepting that for now to keep the comparison cheap; whichever geometry wins should be re-tested against a larger set before it is specified for `src/`.
- **Dark mode is unreviewed.** The dark tokens ship because they cost nothing to include, but they are not an acceptance gate and may be wrong. Do not treat the dark palette in `tokens.css` as approved.
- **We deliberately did not** design search, filtering, sorting, multi-select, drag-to-reshelve, or any book detail view. Those are separate features and would bias the geometry comparison.

## Resolved

- **`mockups/` is sanctioned** as a top-level folder alongside `src/`, `prisma/`, `tests/` and `docs/`. It is committed, not gitignored, so concepts can be compared across machines, and it is excluded from build, lint and typecheck.
- **Books can sit on multiple shelves.** Shelves keep a single parent. Reflected in Data Model, the sample set, the cross-instance rule, and criteria 14–15.
- **The sample set stays small.** Eight siblings and depth 5 stands for now; revisit before the winning geometry is specified for `src/`.
- **Dark mode is not a review gate.** Tokens remain in `tokens.css`, criterion 10 now covers the light palette only.

## Open Questions

1. **Does the root count as a node?** I have made "Tree of Books" a visible root in all three concepts. If the real app drops straight into top-level shelves, Geometry C in particular needs a different centre.
2. **Who picks the winner, and against what?** There is a comparison checklist but no decision rule. If there is a weighting — accessibility over spectacle, say — it should be stated before the designer starts, not after.
3. **Not blocking, but worth deciding early:** should a multi-shelf book show *which* other shelves it is on, or only that it is on others? The first needs room for a shelf name in the node; the second is a dot. The designer can pick per concept and report, but a house answer would save rework.
