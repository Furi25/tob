# Midnight Archive — books after hours

Open `index.html` in a browser by double-clicking it. All artwork, copy, audio synthesis and interactions are local. No server, packages, fonts, external images, API, database or network is required. The Reading Room is unchanged.

## Four explorations, one standalone design

The buttons across the top switch visual interpretations of the same canonical 25-book catalog. Each mode is a variation within the Midnight Archive concept, not a separate application. A single nested ordered list of real book links underlies every visual treatment. The titles, authors, ordering and hooks match The Reading Room. All books have local detail views.

### 01 / The point-and-click study

An original low-resolution illustration of an angled brick room: blue rain at the window, mahogany shelving, a wine-red armchair, a sleeping cat, amber firelight, and a desk with a shaded lamp. Shelf, letter, and journal hotspots open contextual subsets of the catalog. Select a hotspot again or use **All 25 books** to reset. Filters announce the new count, and keyboard focus moves to the catalog.

- Shelf: fiction and imagined worlds.
- Letter: nonfiction, essays, creativity, and reflection.
- Journal: mysteries and psychological suspense.

The existing catalog contains no poetry or indie projects, so none are invented to fill those filters. These are local mood groups, not a proposed production taxonomy.

**Trade-off:** most atmospheric and exploratory, but slower than a direct list. Labels remain visible, so finding the books does not require guessing a hotspot.

### 02 / The candlelit matrix

A long, onyx-and-amber card collection. Cards emerge as they enter view; a dither screen becomes quieter on hover/focus. Original low-resolution symbolic scenes animate on approach: rain, water reflections, or candlelight depending on the motif. The UI typography stays crisp rather than pixelating the reading experience.

**Trade-off:** combines visual browsing with atmosphere, but deliberately scrolls and needs more vertical space. This is a lightweight canvas-and-CSS treatment, not a WebGL shader or a recreation of publisher covers.

### 03 / The lo-fi archive terminal

A monospace title index beside a black, amber-illuminated preview. Pointer hover or keyboard focus changes the record, symbolic illustration and hook. Click any title or **Open this record** to read its detail. In the terminal, the optional soft synthesized click plays when the highlighted record changes. There is no autoplay audio or background music.

**Trade-off:** fastest and most readable way through all 25 books; less physical than a room. The index scrolls independently on desktop. Mobile stacks the preview above the index.

### 04 / The micro-vignette night journey

Five illustrated bands, with five books in each, retaining the sample catalog order:

1. A rain-streaked night train with wine-red upholstery.
2. An overgrown glasshouse library with weathered green framing.
3. An attic workspace lit by a muted monitor.
4. A lamplit harbor room overlooking dark water.
5. A brick-lined hearth and its last embers.

Books sit along each scene's continuous bench/shelf rather than on isolated white cards. On narrow screens they become readable two-column arrangements within each scene.

**Trade-off:** strongest sense of a place and a journey, but the slowest to scan and longest to scroll. These five settings are editorial chapters, not claims about the genres of the five books within each group.

## Recommendation

Use **The terminal** as the primary usability direction, with the study's visual world as the surrounding art direction. For an intentionally exploratory landing experience, pick **The study**. Review the four modes before choosing; no production source is included here.

## Controls and accessibility

- All mode/filter controls are buttons with pressed states and visible focus indicators.
- The canonical catalog is available without JavaScript; artwork and enhanced interactions need JavaScript.
- All 25 book links open native modal dialogs with premise, conversation/context, significance, author background, and a nonfunctional purchase disclosure. Escape or Close dismisses the dialog and focus returns to its opener.
- Unknown book hashes show a missing-record message, not a broken view.
- Sound starts off. It requires explicit opt-in and uses a quiet, short generated tone; no audio files or tracking are used.
- Motion can be paused. System reduced-motion settings suppress the canvas loop, transitions, fades, and scroll animation. Turning motion on does not override a system reduced-motion preference.
- Canvas art is decorative alongside the real links and labels; important book information is never canvas-only.
- A dark palette is intentional in both light and dark OS themes. There is no bright day variant.

## Content and artwork honesty

This uses the same illustrative 25-title selection as The Reading Room, not a verified October 2026 chart. The short editorial text is original sample copy; it is not publisher copy or sourced popularity research. The scenes are original canvas art built from a limited palette and shared narrative motifs, not 25 commissioned illustrations or licensed covers. No real affiliate links are active.

## Verification status

Editor diagnostics were checked for HTML, CSS and JavaScript. No browser renderer or terminal execution was available during authoring, so runtime behavior, screenshots, visual composition, audio loudness, contrast measurements, and viewport layout remain **unverified**.

### Browser review checklist

- Open at 1440×900 and 1024×768; inspect all four modes.
- Repeat with light/dark system settings and reduced motion on/off. The visual palette should stay dark; motion should stop when requested.
- Inspect at 390px width and at 200% browser zoom; allow scrolling instead of clipping content.
- Tab through modes, hotspots, all visible book links, and modal controls. Check Escape and restored focus.
- Select each hotspot and reset; verify counts and that no hidden link receives focus.
- In the terminal, compare hover and keyboard previews. Opt into sound, then disable it.
- In the matrix, scroll and focus cards; check that content remains readable when motion is disabled.
- In the journey, inspect five bands and exactly five books per band.
- Open all 25 details, an unknown book hash, and the purchase disclosure. Exercise browser Back/Forward.
- Disconnect the network: everything should still work.