# Book Detail Page

> **Layout and palette are superseded by [book-detail-open-book.md](book-detail-open-book.md)** (open-book window, new palette roles). Content, routing, metadata, 404 and buy-link rules in this spec still apply.

## Goal

Each book in the shop gets its own page at `/books/[slug]`. A reader who clicks a book in the bookshop scene, or picks one from the "On display" sidebar, lands on a page that shows the book up close. It has a large cover, the title and author, a one-line hook, and short editorial sections: what the book is about, why people are reading it, why it matters, and who wrote it. A buying link is added once there is a real one. Today every link from the landing page returns a 404, so the shop has nothing behind its shelves.

This replaces the *Book detail page* section of [popular-books-discovery.md](popular-books-discovery.md), which listed the content but left the details open. The look follows the "pixel book inspection" from the approved mockup (`mockups/bookstore-display/`): a placeholder hardcover beside the copy, with the dimmed bookshop behind it. It is built as a real, server-rendered page, not the mockup's modal.

## Scope

**In scope**

- Route `/books/[slug]`, server-rendered, working without client JS.
- Every `Book` gets a page, whether or not it is on display (`displaySlot` may be null).
- Content sections built from the existing `Book` fields, plus a new optional author biography.
- A placeholder cover drawn in HTML/CSS when `coverImage` is empty, or a local cover image when one is set.
- Per-book colours from `palette`, with a safe default palette when the stored palette is missing, malformed or low-contrast.
- A buying link that only appears when `affiliateUrl` is a real `https:` URL, with a short disclosure next to it.
- A "Back to the shop" link to `/`.
- A 404 page for unknown or malformed slugs, with HTTP status 404.
- Page `<title>` and meta description.

**Out of scope**

- Opening the book as a modal over the scene (the mockup's flight animation, or Next.js intercepting or parallel routes). See Open Questions.
- Previous/next navigation between books, related books, and breadcrumbs beyond the single back link.
- Real cover art, fetching covers from remote sources, and uploading covers.
- Choosing an affiliate programme and real buying links. The seed keeps `#affiliate-pending`.
- Replacing the placeholder catalog with real content (for example from `docs/books.json`).
- Open Graph images, structured data (JSON-LD) and a sitemap.
- Redirecting near-miss slugs, such as uppercase or trailing slashes, to the canonical slug.

## Data Model

**Schema change, needs a migration.** Add one optional field to `Book`:

```prisma
// Illustrative sketch
model Book {
  // …existing fields unchanged…
  authorBio String?   // short author biography; null = no "About the author" section
}
```

- **Additive and nullable.** Existing rows get `NULL`, and no existing query or test is affected. Migration name suggestion: `add_book_author_bio`.
- **Why a new field:** [popular-books-discovery.md](popular-books-discovery.md) requires a "Who wrote it" section, and the mockup has an Author tab. No current field can hold this. `docs/books.json` already carries `author_bio`, so the field will be needed when the catalog is replaced.
- **Seed:** `prisma/seed.ts` sets `authorBio` to a neutral placeholder (`Placeholder: a short biography of {author}.`), matching how the other placeholder fields are seeded. Re-running the seed still produces identical data.

**Existing fields and how they are used on this page**

| Field | Use |
|---|---|
| `slug` | The route parameter |
| `title`, `author` | The `<h1>`, the by-line, the placeholder cover lettering and the `<title>` |
| `tagline` | The subhead under the by-line |
| `summary` | The meta description only (not shown on the page) |
| `about` | Section "What it's about" |
| `whyPopular` | Section "Why people are reading it" |
| `whyItMatters` | Section "Why it matters" |
| `authorBio` (new) | Section "About the author" |
| `affiliateUrl` | Buying link, only if it is a valid `https:` URL |
| `coverImage` | Cover `<img>`, only if it is a valid local path (see below) |
| `palette` | Page colours, only if valid and readable (see below) |

`popularityRank`, `displaySlot`, `createdAt` and `updatedAt` are not shown.

**Stored values that need validation.** These fields are free-form in the database, so the loader validates them before they reach a component. Anything that fails validation is treated as missing.

```ts
// Illustrative — Zod shapes, not final code
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Palette = z.object({ primary: Hex, surface: Hex, text: Hex, highlight: Hex }).strict();

const CoverPath = z.string().regex(/^\/covers\/[a-z0-9-]+\.(webp|png|jpg)$/); // files under public/covers/

const BuyUrl = z.string().url().refine((u) => new URL(u).protocol === "https:");
```

- **Palette readability rule.** A palette that passes the shape check is accepted only if all three of these hold. Otherwise the default palette is used.
  - `text` on `surface` has a contrast ratio of at least 4.5:1.
  - `highlight` on `surface` has a contrast ratio of at least 4.5:1, because `highlight` is used for link text.
  - `surface` on `primary` has a contrast ratio of at least 3:1, because that is the large lettering on the placeholder cover.
- **The default palette** is defined once and matches the bookshop's existing dark-wood and amber look. It must pass the same readability rule.

## API Contracts

The page doesn't change any data, so there are no Server Actions or route handlers.

### Route param — `slug`

- **Validation (Zod):** `z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)`.
- **Invalid →** `notFound()` without querying the database.

### Server data loader — `getBookBySlug(slug)` in `src/server/books.ts`

- **Server-only** (`import "server-only"`). It is wrapped in React `cache()`, so `generateMetadata` and the page share one query per request.
- **Input:** a slug that has already been validated.
- **Output:**
  ```ts
  type Palette = { primary: string; surface: string; text: string; highlight: string };
  type BookDetail = {
    slug: string;
    title: string;
    author: string;
    tagline: string;        // may be "" — the subhead is then omitted
    summary: string;        // used only for the meta description
    about: string;
    whyPopular: string;
    whyItMatters: string;
    authorBio: string | null;
    buyUrl: string | null;  // valid https URL, otherwise null
    coverImage: string | null; // valid /covers/… path, otherwise null
    palette: Palette;       // the stored palette if valid and readable, otherwise the default
  };
  // returns null when no book has this slug
  ```
- **Behaviour:** it selects only the fields above with `findUnique({ where: { slug } })`, then applies the validation rules from Data Model.
- **Errors:** if the database is unreachable, the error propagates to the existing `src/app/error.tsx`. It must not turn into a 404.
- **Auth:** none. This is public content.

### Page metadata — `generateMetadata`

- **Found:** the title is `{title} by {author} · Tree of Books`. The description is `summary`. If `summary` is empty, the root layout's description is used instead.
- **Not found:** the title is `Book not found · Tree of Books`. Next.js adds `noindex` automatically.

## UI Surface

### Route `/books/[slug]` — `src/app/books/[slug]/page.tsx` (Server Component)

The whole route is Server Components. No `"use client"` component is added for it.

- **Rendering:** per request (`dynamic = "force-dynamic"`), the same as `/`. There is no `loading.tsx` and no `<Suspense>` around the content. This is so that `notFound()` runs before streaming starts and the response gets a real 404 status (see Risks), and so the page works without JS, for the same reason as the landing page.
- **Page structure:**
  1. **Backdrop.** The bookshop artwork (`/bookshop/scene@v1-1376.webp`) is darkened behind the page as a CSS background. It is decorative and not in the accessibility tree. All text sits on a solid `surface` panel, never on the artwork. If the image fails to load, nothing else changes.
  2. **"Back to the shop" link** to `/`, the first focusable element on the page.
  3. **Two columns at 840px and wider; stacked below that, with the cover first.** This is the same breakpoint as the landing page.
     - **Cover**, in a 2:3 box:
       - With `coverImage`: an `<img src={coverImage} alt="Cover of {title}">` with `object-fit: contain`.
       - Without it: a **placeholder hardcover**, done in pure HTML/CSS. It has a `primary` cloth colour, the title and author lettered in `surface`, a shaded spine and a hard offset shadow, in the mockup's style. It is `aria-hidden="true"`, because the `<h1>` and by-line already carry this text. No canvas and no client JS.
     - **Copy:**
       - `<h1>` with the title.
       - `<p>` "by {author}".
       - The tagline as a subhead `<p>`.
       - The sections below, each an `<h2>` with its paragraph text, in this order: "What it's about", "Why people are reading it", "Why it matters", "About the author".
       - The buying block.
  4. **Buying block:**
     - **`buyUrl` set:** a link with the text "Buy {title}", `href={buyUrl}` and `rel="sponsored"`, with this sentence right next to it: "We may earn a commission if you buy through this link."
     - **`buyUrl` null:** the text "Buying links are coming soon." There is no link, no button and no disabled control.
- **Missing content:** a section whose field is empty or whitespace-only is left out entirely, with no heading and no empty element. `authorBio = null` leaves out "About the author". The title and author are always present (the schema requires them).
- **Colours:** the page root sets the four palette values as CSS custom properties.
  - `surface`: panel background.
  - `text`: body text and headings.
  - `highlight`: links, the buying link and the focus ring.
  - `primary`: the placeholder cover cloth and decorative rules.

  The values have already been validated as `#rrggbb`, so they cannot inject CSS.
- **Focus:** every link has a visible focus indicator in `highlight`, which already has at least 4.5:1 contrast against `surface`.
- **Motion:** none beyond hover and focus colour changes. Under `prefers-reduced-motion: reduce`, those happen instantly. The mockup's flight animation is not built.

### Not found — `src/app/books/[slug]/not-found.tsx` (Server Component)

- An `<h1>` with "We couldn't find that book.", a short line of text, and a "Back to the shop" link to `/`. It uses the default palette and the same backdrop.
- HTTP status 404.

### States

| State | What the reader sees |
|---|---|
| Found, full content | Every section, with the cover and buying block |
| Found, partial content | Only the non-empty sections; no gaps or empty headings |
| No cover | Placeholder hardcover |
| No or invalid palette | Default palette |
| No real buying link | "Buying links are coming soon." |
| Unknown or malformed slug | Not-found page, status 404 |
| Database down | Existing `error.tsx` (status 500), not a 404 |
| Loading | The browser's normal page-loading state. There is no skeleton (see Risks). |

## Acceptance Criteria

**Routing and status**

1. For every seeded book, `GET /books/{slug}` returns status 200 with server-rendered HTML (no client JS needed). The HTML has an `<h1>` with the title, "by {author}", and the tagline.
2. Every link on `/`, both hotspots and sidebar links, leads to a status-200 detail page whose `<h1>` is the linked book's title.
3. A book with `displaySlot = null` still has a status-200 detail page.
4. `GET /books/no-such-book` (well-formed, unknown) returns status 404. It shows the "We couldn't find that book." heading, a link to `/`, and `<meta name="robots" content="noindex">`.
5. Malformed slugs return status 404 without querying the database: uppercase (`The-Hobbit`), dot segments, percent-encoded characters, a leading or trailing `-`, a double `--`, an empty string, and anything over 100 characters. The slug schema is unit-tested against each of these.
6. If the database is unreachable, the route renders the error page with status 500, not the not-found page.

**Content**

7. The page shows these headings, in this order: "What it's about" (`about`), "Why people are reading it" (`whyPopular`), "Why it matters" (`whyItMatters`), "About the author" (`authorBio`). Each heading is followed by its field's text.
8. A section whose field is empty or whitespace-only is not rendered: no heading and no empty element. With `authorBio = null`, "About the author" is absent. With an empty `tagline`, there is no subhead element.
9. The page has exactly one `<h1>`, and every section heading is an `<h2>`.
10. `summary`, `popularityRank` and `displaySlot` do not appear in the visible page. `summary` appears only as the meta description.
11. The document title is `{title} by {author} · Tree of Books`. The meta description equals `summary`, or the root layout's description when `summary` is empty. The not-found title is `Book not found · Tree of Books`.

**Buying link**

12. With `affiliateUrl` set to a valid `https:` URL, the page has one link with the text "Buy {title}", that `href`, and `rel` containing `sponsored`, plus the visible commission disclosure sentence.
13. With `affiliateUrl` set to `#affiliate-pending`, an `http:` URL, a `javascript:` URL, a relative path or an empty string, the page shows "Buying links are coming soon." and has no buying link. No `href` on the page starts with `javascript:` or `#affiliate`.

**Cover**

14. With `coverImage = null`, the page shows a placeholder cover in a 2:3 box with the title and author as text. The placeholder is `aria-hidden="true"`.
15. With `coverImage = "/covers/the-hobbit.webp"`, the page has an `<img>` with that `src` and the alt text "Cover of {title}", and no placeholder.
16. With `coverImage` set to an absolute URL (`https://…`), a protocol-relative URL (`//…`), a `javascript:` URL, a path outside `/covers/`, or a path with `..`, the page shows the placeholder and no `<img>` with that `src`.

**Palette**

17. With a valid, readable palette, these computed colours equal the palette values: the panel background (`surface`), the `<h1>` colour (`text`) and the buying link colour (`highlight`).
18. With `palette = null`, a palette missing a key, a palette with an extra key, a non-hex value (for example `"red; background: url(x)"`), or a palette that fails the readability rule, the computed colours equal the default palette's. The rendered HTML contains none of the rejected values.
19. The default palette passes the readability rule (unit test).
20. With both the default palette and an accepted palette, all visible text on the page meets 4.5:1 contrast against its background (checked with axe).

**Layout and accessibility**

21. At 1440px and 1024px wide, the cover and the copy sit side by side. At 768px and 375px, the cover is above the copy. At none of these widths does the document have a horizontal scrollbar.
22. The first Tab from the top of the page focuses "Back to the shop", and that link goes to `/`. Every link shows a visible focus indicator.
23. With the backdrop image request blocked, the page still renders all content, and contrast (criterion 20) still passes.
24. With `prefers-reduced-motion: reduce`, hover and focus styles change instantly with no transition.
25. The route adds no client component. With JavaScript disabled, criteria 1, 7, 12 and 22 still hold.

**Data**

26. The migration adds `authorBio` as a nullable text column, and existing rows keep their data. After `prisma db seed`, every book has a non-empty `authorBio`, and running the seed twice produces identical rows.

## Risks and Trade-offs

- **A page, not a modal.** The mockup's recommended direction keeps the dimmed bookshop on screen and flies a book towards the reader. A real page with the shop as a static backdrop keeps most of that feel, and it:
  - works without JS,
  - can be linked and indexed,
  - keeps the hotspot links from the landing page spec honest,
  - needs no client code.

  The cost is losing the "never left the shop" feeling and the flight animation. Intercepting routes could add a modal on top later without changing this page.
- **Status codes depend on not streaming.** Next.js only sends a 404 status if `notFound()` runs before streaming starts. Adding `loading.tsx` or a `<Suspense>` boundary around the content later would silently turn 404s into 200s with a `noindex` tag. The landing page already avoids streaming, for its own reasons.
- **No loading skeleton.** This is the same trade-off as the landing page: one indexed `findUnique` for one row.
- **Per-request rendering.** Static generation would be faster, but it would need the database at build time, and the build currently doesn't. Book content changes only on reseed, so this is a candidate for caching later.
- **Placeholder copy is visible.** The seeded `tagline`, `whyPopular`, `authorBio` and `summary` are obviously placeholder text, and they will read that way on the page. That is accepted while the catalog is a stand-in (see bookshop-display.md → Risks → Placeholder catalog).
- **Palette data is a trust boundary.** Palettes are stored as free-form JSON and end up in CSS. Strict hex validation removes the risk of CSS injection. The readability rule stops a badly chosen palette from making a page unreadable. The cost: a palette that is slightly off is silently replaced by the default. That is preferable to an unreadable page, but someone editing palettes won't see an error.
- **Cover and buying URLs are a trust boundary.** Only local `/covers/…` images and `https:` buying links are rendered. This blocks `javascript:` URLs, mixed content and hot-linked images. Remote covers would need `next/image` remote patterns or a proxy, which is a later decision.
- **Strict slugs, no redirects.** `/books/The-Hobbit` returns a 404 instead of redirecting. That is simpler and avoids duplicate URLs. The cost is that hand-typed links with capitals fail.
- **`rel="sponsored"` without `target="_blank"`.** The buying link opens in the same tab, like every other link. Search engines are told it is paid. Whether attribution needs anything else depends on the affiliate programme (Open Questions).
- **Backdrop weight.** The 1376px artwork adds about the same weight as the landing page's smallest image, on every detail page. It is decorative, so the page doesn't wait for it, and it is cached after the first view.

## Breaking Change

- **Database schema:** a new nullable `Book.authorBio` column, which **needs a Prisma migration**. It is additive, and existing data and queries are unaffected.
- **New public route:** `/books/[slug]` stops returning 404 for known books. The landing page's links don't change, and no existing test asserts the 404.
- **Spec supersession:** the *Book detail page* parts of [popular-books-discovery.md](popular-books-discovery.md) (API contract 2 and UI Surface → Book detail page) are replaced by this spec.
- There are no changes to the landing page or to any external contract.

## Open Questions

1. **Page or modal?** Is a full page with the shop as a dimmed backdrop acceptable, as specified here? Or should clicking a book on `/` open it as a modal over the live scene (intercepting routes), with this page as the direct-link fallback? The modal version needs client JS for closing and focus return, and it roughly doubles the work. *Proposed: the page now, the modal later if wanted.*
2. **Author bio field:** OK to add `authorBio` now, with placeholder seed text? The alternative is to show only the name, and leave out "About the author" until the real catalog lands. *Proposed: add it now.*
3. *(Non-blocking)* **Catalog:** should the placeholder classics be replaced with the 2026 bestsellers in `docs/books.json` (which have real `about`, `why_popular` and `author_bio`)? That is a reseed, plus mapping `why_popular` from a list to text. It would be its own small spec.
4. *(Non-blocking)* **Affiliate programme:** which retailer or network, and does it need anything beyond `rel="sponsored"` (for example a tracking parameter format or `noreferrer` rules)? Until then, every book shows "Buying links are coming soon."
