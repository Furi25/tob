# The Little Bookshop — single-screen reference experiment

Open `index.html` directly in a browser. Other concepts, including The Reading Room and Midnight Archive, are unchanged.

## Important reference limitation

The supplied reference is `docs/bookstore.jfif`. The available image viewer could not display JFIF, so its composition was **not visually inspected**. This is therefore a reference-backdrop experiment, not a claimed faithful reconstruction of that image.

Click **Load bookstore image** and select the supplied JFIF in the browser to use it as the full-screen room backdrop. Nothing is uploaded; the browser reads the chosen file locally. The selection is not persisted across refreshes. Clear image restores the self-contained CSS bookshop. **Books off** lets you judge the backdrop without overlays. The image is centered and cropped with `object-fit: cover`, so fixed shelf overlays are not guaranteed to align with shelves in the reference. A PNG or JPEG version that can be inspected is needed for precise art-directed placement.

This local-file picker keeps the mockup self-contained without editing or depending on files outside its folder. There are no external images, packages, APIs, fonts, or requests.

## Design

- One viewport, one warm room; no introductory hero, scroll journey, terminal, or page footer.
- A small wordmark, quiet image-preview tools, and a contextual bottom caption.
- All 25 sample titles from The Reading Room, in the same order, represented by original typographic jackets.
- Three face-out shelves at desktop widths, five compact rows on mobile. Hover/focus lifts a book forward; clicking opens an in-place detail panel.
- Detail content is split into short selectable sections (story, relevance, author), so it does not need a separate long page. The purchase action reveals a nonfunctional affiliate disclosure.
- Native dialog keyboard focus trapping, Escape dismissal and opener-focus restoration.
- No ambient animations; only short hover transitions, disabled under reduced motion. The room remains deliberately warm/dark under either OS theme.

## Trade-off and recommendation

This keeps the single-screen constraint rather than introducing a second navigation system. The backdrop provides atmosphere while real HTML links keep books usable. The trade-off is that tiny mobile books are less readable and reference composition must be inspected before the overlays can be made to feel physically integrated. Use this as a spatial proof, not the final art direction. The Reading Room remains the more resolved design until the reference is visible and reviewed.

## Verification

Editor diagnostics checked for the HTML, CSS and JavaScript. No browser rendering, runtime execution or screenshot validation was available. No claim is made that shelf positions match the unviewed image. No hidden overflow is used to disguise clipping. Desktop page geometry is positioned within viewport bounds; native detail dialogs can scroll on unusually small or highly zoomed viewports to preserve access rather than cut content off.

Review in-browser at 1440×900 and 1024×768, both light/dark OS themes, with reduced motion on/off. Confirm no page scrollbar. Try image selection, cropping, Books off, Clear image, all 25 details, keyboard focus, Escape, purchase disclosure and Back/Forward. On mobile or at 200% zoom, readability and modal scroll behavior need particular attention.