# Bookstore display — percentage-mapped artwork

Open `index.html` directly in a browser. This is the only mockup kept in `mockups/`.

## Full-screen sparkle revision

Removed accidentally concatenated legacy HTML, CSS and JavaScript that conflicted with the active mockup and produced overlapping content. There is now one document and one script controller, with base scene styles and a separate inspection styling layer. The image fills a fixed viewport; compact controls and a single bottom status caption overlay it instead of reducing its available height. Tooltip positions use viewport coordinates.

Every mapped polygon has a fine gold SVG outline and slowly traveling glints with staggered timing. These decorations ignore pointer input and use static highlights under reduced motion. Default fill mode preserves aspect ratio but crops outer artwork at mismatched viewport ratios. **Full scene** reveals the whole illustration with letterboxing; **Fill screen** returns to the full-bleed view. All 25 records remain available through the index in either mode. Exact rendered layout, sparkle intensity and cropping require browser review; editor diagnostics are not visual verification.

## Pixel book inspection

Click any mapped book or choose a title from the index. A placeholder hardcover grows from the mapped position toward the viewer over 950ms, gently overshoots and settles beside the book information. Returning to the shelf or pressing Escape reverses the movement over 450ms. If a title's mapped position is outside the cropped scene, the entrance starts at the bottom of the viewport instead. Direct book hash links also open the inspection view.

The cover illustration is original local canvas artwork drawn at 96×144 pixels and enlarged with pixelated sampling. Five cloth-and-foil palettes, three small motifs, grain, a moon and stepped landscapes provide variety; these are not reproductions of published covers. Titles and authors remain readable HTML lettering. A shaded spine, hard offset shadows and a striped page block make the flat artwork read as a physical object. No external fonts, images, packages or requests are added for covers.

The desktop layout pairs the large cover with editorial text; at 700px and below it stacks vertically and permits dialog scrolling. Native modal focus handling is retained. Reduced motion skips both outward and return flights and the delayed text reveal, including when the preference changes while the dialog is open.

Design choice: keep the dimmed bookstore present rather than replace it with a separate page. Recommended direction is this tactile foreground book. Trade-off: the flight substitutes an illustrative cover for the book painted into the background; the background itself is not cut out or reconstructed. All sample content and shelf mappings remain unchanged.

## PNG mapping revision

The converted `docs/bookstore display.png` has now been visually inspected and is the default background. The guide's original cluster positions do not correspond to this artwork. The `positions` array in `app.js` supersedes the original rectangles in the HTML: 25 book-shaped polygons have been traced approximately against visible face-out books and open books, including five foreground-left books, the floor/table books, the right-hand stand and counter display, and selected background shelf books. The title assignment stays in the guide's order, not the invented lettering in the artwork. Hover targets follow the traced silhouettes; keyboard focus uses an unclipped outline for visibility.

This corrects the earlier uninspected mapping; it is not a browser-verified pixel-perfect calibration. Use **Show mapping** to review the new traces in the browser. Only edit the `positions` array to refine the active coordinates. The PNG reference still lives outside this folder, as described below.

## What is implemented

- The supplied PNG artwork is loaded directly, not replaced with a generic scene.
- All 25 titles and author labels from the user's guide are retained. Active coordinates now come from visual tracing of the PNG, not the incorrect cluster rectangles. This intentionally uses that guide's classic/fantasy selection rather than the earlier popular-books samples.
- The illustration fills the viewport proportionally by default, with optional uncropped **Full scene** letterboxing. Image and interactive targets share the same stage dimensions.
- The interactive layer is one semantic ordered list of real links. Hover/focus highlights the original artwork without pasting substitute covers over it. Tooltips are bounded to the viewport and Escape dismisses them.
- A visible **Show mapping** button reveals red, numbered calibration rectangles.
- Click/Enter opens a native modal pixel book inspection with original sample premise, relevance and author copy in selectable sections, plus a nonfunctional affiliate disclosure. No API, account or tracking.
- **All 25 books** opens a readable index, particularly useful on touch devices where the original art's individual book targets become small. The main scene never needs to scroll; dialogs may scroll for keyboard zoom or narrow screens rather than clip content.
- System reduced-motion disables hover transitions. The warm dark palette is intentional under both light and dark OS themes.

## Asset limitation

The original JFIF could not be displayed, but its converted PNG has now been visually inspected. There is still no browser renderer for checking the interactive overlay against the image at actual viewport sizes.

The default background is a relative reference to the existing image outside this folder. This is the single exception to folder self-containment: the folder works in its current workspace position, but the referenced image will not travel with it. To move the mockup independently, copy the supplied artwork into this folder as `bookshop-bg.jpg` and change the image `src` accordingly, or use **Choose artwork** to select it locally after opening. JFIF normally decodes in browsers even though the assistant's image viewer cannot display it. Local file selection uploads nothing and is not persisted after refresh.

## Review and trade-off

The benefit is a complete illustrated bookstore rather than a website grid. The cost is discovery: books far away in the artwork become tiny at narrow sizes, so the index is an essential companion, not oversized overlapping hitboxes. There are no invented claims that the book's name matches text physically printed in the illustration.

Editor diagnostics were checked. Browser rendering, image decoding, flight timing and exact visual alignment remain unverified. Open at 1440×900 and 1024×768, enable **Show mapping**, and compare all 25 areas with the artwork. Repeat at mobile width, with keyboard navigation, light/dark OS themes and reduced motion. Check both fill and full-scene modes, no document scrollbar, tooltip edge clamping, book entrance/return, Escape during entrance, focus restoration, switching information sections and the readable index. Confirm long titles such as The Catcher in the Rye and long author credits fit their covers. Adjust the `positions` array for mapping refinements; changing viewport size alone should not require coordinate changes.