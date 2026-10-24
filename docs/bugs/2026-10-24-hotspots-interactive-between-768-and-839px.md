# Hotspots are still interactive between 768px and 839px

- **Severity**: major
- **Spec**: docs/specs/bookshop-display.md, criterion #14 (breakpoint revised to 840px; see criterion #13 and Resolved → Mobile breakpoint)
- **Affected**: `src/components/bookshop/bookshop.module.css`, `src/components/bookshop/drawer.module.css`, route `/`

## Steps to Reproduce
1. Run `npm run db:local`, then `npm run dev`.
2. Open `/` in a viewport 839px wide.
3. Press Tab repeatedly, or inspect the accessibility tree.

## Expected
Below the 840px breakpoint, the hotspots cannot be clicked or focused and are not in the accessibility tree. Every book is reachable through the sidebar, which is full width below the breakpoint.

## Actual
The hotspots are hidden only below 768px (`@media (max-width: 767.98px)`). From 768px to 839px they are rendered, focusable and in the accessibility tree. At those widths the counter books (slots 21–24) are under 24px and fail WCAG 2.5.8 (criterion #13). The sidebar's full-width rule uses the same old breakpoint.

## Evidence
`tests/e2e/bookshop-display.spec.ts` › below the breakpoint › `#14 at 839px hotspots are out of the accessibility tree, not focusable and not clickable`

```
Error: A Game of Thrones by George R.R. Martin
expect(locator).toHaveCount(expected) failed
Locator:  getByRole('link', { name: 'A Game of Thrones by George R.R. Martin', exact: true })
Expected: 0
Received: 1
```

## Verification
Fixed and verified on 2026-10-24. Both media queries now use `max-width: 839.98px`. The full Playwright suite passes (51 passed, 1 skipped), including `#14 at 839px` and `#13 at 840px`.
