# The Reading Room

Open `index.html` directly in a browser. No server, packages, web fonts, remote images, or build step is required.

### Optional real cover previews

Click **Real covers ↗** at the top right to request edition-specific ISBN cover images from Open Library. This is an opt-in online preview: the default mockup still works offline, and no remote requests are made until enabled. The same switch applies to catalog and detail covers; spines remain original approximations, not scans. Toggle off to compare the original designs.

Requests disclose your IP address to the image provider; the page sends no referrer. Artwork belongs to its respective rights holders. These previews are for design review, not a production asset license. Some editions may be unavailable or use a different jacket; ISBN mappings and remote results have not been network-verified here. Successful catalog loads and errors are counted in the quiet caption. Slow requests leave placeholders visible; failed or tiny blank responses do not replace them. No image files were downloaded into the repository.

## Direction

A viewport-sized book room replaces the masthead, spotlight, and footer. Only a small top-left logo, a compact layout picker, and quiet sample-content captions surround the collection. All 25 titles have a detail view, with six mood palettes, original typographic cover studies, premise, editorial context, significance, and author notes.

Three display treatments share the same content and detail pages:

- **Shelves (recommended):** three floating shelves of angled, face-out books; hover or keyboard focus pulls a cover forward and shows its title, author, and hook.
- **Cover wall:** a clean, flat poster collection without shelf rails, with a gentle forward lift.
- **Spines:** two shelves of upright spines; hover or keyboard focus reveals the full jacket in front of its neighbors.

These are alternate display modes inside one self-contained concept, not separate projects. Switch modes using the small buttons at the top right. Clicking a book still opens its themed detail page, where reading content can scroll normally.

This follows the popular-books-discovery brief, not the superseded tree geometry brief. The new brief does not specify an exact token palette or canonical 25-title set, so this concept defines its own. There is no tree navigation. The source catalog remains a semantic ordered list of real links; contextual detail navigation is another nested list within the article structure.

## Honest sample content

These are recognizable contemporary titles selected for visual exploration, not a verified current bestseller chart. Order is illustrative. No live popularity source was consulted. All jacket artwork is an original placeholder, not a recreation of official covers. Editorial copy is short, original sample writing, not publisher copy. Purchase actions reveal the affiliate disclosure; there is no real affiliate URL, tracking, or retailer integration.

## Interactions to review

- Open any of the 25 books; compare Fourth Wing, Great Big Beautiful Life, and The Anxious Generation for different moods.
- Use the detail table of contents and the purchase disclosure action.
- Continue to the next book, use browser Back/Forward, and return to the edit.
- Tab through the catalog, activate links with Enter, and check focus restoration when returning to the edit.
- Load an unknown `#book/` fragment to view the missing-book state.
- Disable JavaScript: all 25 titles, authors, and hooks remain visible, with a note explaining that detail views need JavaScript in this prototype.

## Review status

Responsive rules target nine columns across three rows at desktop widths including 1440px and 1024px, with the last seven books inset. Spines use thirteen columns across two rows. The room uses the viewport height, with a 560px minimum readable height. Below 760px, all modes use five columns across five rows and a 740px minimum room height. Short screens and browser zoom may therefore scroll intentionally rather than clip books or disable access. Light/dark system themes and reduced-motion overrides are implemented. No browser rendering or runtime execution was available during authoring, so these are implementation intentions, not verified visual results.

### Manual browser checks still required

- 1440×900 and 1024×768 in all three layouts, each in light and dark mode, each with reduced motion on/off; check that the landing page has no scrollbars.
- Small mobile viewport, long titles, visible focus outlines, full keyboard navigation.
- All 25 details, Back/Forward, layout switches, affiliate disclosure, and unknown-book route.

## Trade-off

The shelf treatment prioritizes a full-room overview over large permanently visible summaries. Context is revealed on hover/focus or by opening a book; touch users can open books directly. Cover wall is easiest to scan, shelves feel most tactile, and spines provide the strongest library metaphor but hide covers until approached. Six shared mood palettes give less individual art direction than 25 bespoke pages. The lightweight hash routes are disposable prototype navigation, not the production routing architecture.