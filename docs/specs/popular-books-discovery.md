# Popular Books Discovery Redesign

## Goal

Replace the tree-like shelf navigation with a discovery-first editorial experience built around the most popular books of the moment. The landing page should feel like a curated storefront or magazine cover wall: visually rich, easy to browse, and designed to surface the strongest titles immediately. Each book click opens a dedicated detail page whose visual treatment, tone, and palette align with that specific book so the experience feels intentional rather than generic.

## Scope

**In scope**

- A landing page featuring the top 25 books of the moment, arranged as an attractive editorial grid or feature layout.
- Book cards with short, compelling summaries, author attribution, and a clear visual identity.
- A dedicated detail page for each selected book with author, premise, importance, popularity rationale, and affiliate CTA.
- Page-level theming that adapts the book detail experience to the book’s palette, mood, or cover language.
- A clean browsing flow that makes discovery feel fast, tactile, and premium rather than hierarchical.

**Out of scope**

- Tree-based browsing, category trees, or shelf metaphors.
- User accounts, bookmarks, reading lists, or recommendations engines.
- Search, filtering, or complex taxonomy management in this phase.
- Real-time popularity calculations or external analytics dashboards.
- Deep multi-page editorial content beyond the landing page and single-book detail view.

## Data Model

This redesign changes the primary product model from a taxonomy-first structure to a discovery-first catalog.

```ts
// Illustrative only — not a working implementation

type Book = {
  id: string;
  slug: string;
  title: string;
  author: string;
  publishedYear?: number;
  coverImage?: string;
  accentColor?: string;
  palette?: {
    primary: string;
    surface: string;
    text: string;
    highlight: string;
  };
  tagline: string;
  summary: string;
  about: string;
  whyPopular: string;
  whyItMatters: string;
  affiliateUrl: string;
  externalLinkLabel?: string;
  categories: string[];
  popularityRank: number;
};
```

**Required changes from the earlier tree concept**

- Remove the shelf and parent/child hierarchy as the primary navigation model.
- Add a curated, explicitly editorial list of books as the main landing artifact.
- Store a visual theme for each book so the detail page can use a consistent palette and mood.
- Maintain a single canonical book record with a stable slug for detail-page routing.

This is a product-model change and should be treated as a breaking change relative to the tree-based approach.

## API Contracts

This phase is still intentionally lightweight and can be served as server-rendered content or a simple data layer contract. The purpose is to support a browsing-first UX rather than a filesystem/tree traversal model.

### 1. GET /

**Purpose**

Render the homepage featuring the top 25 books.

**Input shape**

- No required request body.
- Optional query parameters for `featured`, `limit`, or `sort` in later iterations.

**Output shape**

```ts
type HomePageData = {
  books: Array<{
    id: string;
    slug: string;
    title: string;
    author: string;
    tagline: string;
    summary: string;
    coverImage?: string;
    accentColor?: string;
    popularityRank: number;
  }>;
};
```

**Error cases**

- Empty catalog state: show a tasteful fallback message and no broken cards.
- Missing covers or metadata: fall back to a neutral tile treatment.

**Auth requirements**

- None for public browsing.

### 2. GET /books/[slug]

**Purpose**

Render a dedicated book detail page.

**Input shape**

- Route param: `slug`

**Output shape**

```ts
type BookDetailData = {
  id: string;
  slug: string;
  title: string;
  author: string;
  publishedYear?: number;
  tagline: string;
  about: string;
  whyPopular: string;
  whyItMatters: string;
  affiliateUrl: string;
  coverImage?: string;
  palette?: {
    primary: string;
    surface: string;
    text: string;
    highlight: string;
  };
};
```

**Error cases**

- Unknown slug: render a 404-style book not found state.
- Missing key content: degrade gracefully by showing a neutral page shell and a fallback summary.

**Auth requirements**

- None for public book pages.

## UI Surface

### Landing page

**Route**

- `/`

**Layout**

- Hero feature block for the top-ranked title or a small set of “featured” books.
- Editorial card grid for the remaining titles.
- Strong visual hierarchy: title, author, one-line hook, and a compact summary.
- Cards feel like posters, not list rows.

**Component roles**

- Landing page and content blocks are server-rendered by default.
- Small client-side enhancements such as hover motion or card focus states may be used if needed, but the primary experience should work without JS.

**States**

- Loading: skeleton or fading placeholders while content arrives.
- Empty: simple editorial fallback with a note that the list is temporarily unavailable.
- Focus: visible ring and strong keyboard navigation across card links.

### Book detail page

**Route**

- `/books/[slug]`

**Layout**

- Cover art or visual treatment at the top, paired with the title and author.
- Short “tagline” or hook as an editorial subhead.
- Structured sections for:
  - What it is about
  - Why it is popular / important
  - Who wrote it
  - Purchase or affiliate CTA
- The whole page adopts a palette derived from the book or its cover language.

**Content requirements**

- The tone must feel confident, editorial, and readable.
- The page should avoid generic “book metadata” boxes and instead read like a curated feature page.
- The affiliate link should be visible but never dominate the composition.

## Acceptance Criteria

1. The primary landing experience is a curated, editorial list of the top 25 books rather than a tree or shelf navigator.
2. Each book card is visually distinct and includes enough information to feel like a feature tile instead of a bare list item.
3. Clicking a book opens a dedicated detail page that matches the book’s tone, palette, or cover language.
4. The detail page includes the required content: premise, importance, author, and affiliate link.
5. The page supports clear keyboard focus and readable, non-visual-heavy navigation patterns.
6. The design treats the homepage as discoverability-first and the detail page as a brand-aligned feature story rather than a generic metadata page.
7. The system works gracefully when the book data is partial or a cover is missing.

## Risks and Trade-offs

- A highly visual layout can become noisy if every book uses a different palette without restraint.
- The detail-page visual system must be strong but not so stylized that it undermines readability.
- Curated editorial lists can feel subjective; this takes care to keep the “top of the moment” framing clear.
- Affiliate links can feel promotional if they overpower the content; the design should keep them as a clear call-to-action, not a dominant element.

## Open Questions

- Should the “top 25” list be static editorial curation, or sourced dynamically from a live list or feed?
- Do we need explicit cover assets, or are we okay with stylized placeholders while the content is being defined?
- How much of the book detail page should be deeply personalized by tone and palette versus staying consistent across all titles?
- What is the exact affiliate model and link format we need to support in the app?

## Breaking Change

This plan intentionally replaces the current tree/shelf navigation with a discovery-driven editorial browsing model. Any implementation based on the earlier tree structure should be considered superseded by this direction.
