# The multi-scene refactor leaves the existing suite unable to run

- **Severity**: major
- **Spec**: docs/specs/multiple-bookshop-scenes.md, *Breaking Changes* (the "Tests that assume one scene or 25 hotspots need updating" line) and the removal of `HOTSPOTS`, `ARTWORK_VERSION`, `ARTWORK_SIZE`, `ARTWORK_WIDTHS` and `Book.displaySlot`
- **Affected**: `npm run test:e2e`, `npm run test`, `npm run typecheck`. Files listed below. No production behaviour was shown to be wrong. The tests that still use the old API were not migrated.

## Steps to Reproduce
1. Start Postgres with `npm run db:local`.
2. Run `npx playwright test --reporter=json --max-failures=0`.
3. Run `npm run typecheck` and `npm run test`.

## Expected
The existing bookshop, highlight, fit and book-detail tests run against the `Scene` registry and `Placement` table and are green, as they were before the refactor (Vitest 190 passed, full e2e 141 passed + 1 skipped).

## Actual
`npx playwright test` ran **0 tests**. Playwright aborts the whole run when a spec file throws while loading:

```
TypeError: Cannot read properties of undefined (reading 'height')
   at bookshop-display.spec.ts:727   const ratio = ARTWORK_SIZE.height / ARTWORK_SIZE.width;
TypeError: Cannot read properties of undefined (reading 'width')
   at bookshop-fit.spec.ts:24        (fixed by the tester in this pass, see below)
```

Still failing and not owned by the window-fit work:

| File | Result | Cause |
|------|--------|-------|
| `tests/e2e/bookshop-display.spec.ts` | load crash, blocks the whole e2e run; 9 type errors | imports `ARTWORK_SIZE`, `ARTWORK_VERSION`, `HOTSPOTS`; uses `/bookshop/scene@` file names |
| `tests/e2e/support/db.ts` | 11 type errors | `displaySlot` no longer exists on `Book` |
| `tests/e2e/support/book-fixtures.ts` | 1 type error | same |
| `tests/e2e/book-detail-page.spec.ts` | 1 failed, 43 skipped (serial) | `precondition: the seed creates 25 books` gets 54; route mock uses `**/bookshop/scene@*` |
| `src/components/bookshop/hotspots.test.ts` | suite error `Cannot read properties of undefined (reading 'map')`; 9 type errors | imports the removed `HOTSPOTS`, `ARTWORK_*` |
| `src/components/bookshop/scenes/test-helpers.test.ts` | 1 failed | reads `public/bookshop/scene@v1-1376.webp`, deleted by the rename to `bookshop@v1-*.webp` |
| `tests/integration/bookshop-display.db.test.ts` | 11 failed, 8 type errors | `PrismaClientValidationError` on `book.create`, `createMany`, `findMany` (`displaySlot`) |
| `tests/integration/book-detail-page.db.test.ts` | 37 failed | 36 × `PrismaClientValidationError` on `book.create` (`displaySlot`), 1 × expected 25 books, got 54 |

Vitest total after the tester's edits: 626 tests, 575 passed, 51 failed. Of the 51, 48 are in the two integration files above, 1 is the stale file name, 1 is the Abbey target-size bug (separate report) and 1 is the cover-fetch tool (see "Not related"). `hotspots.test.ts` fails as a suite and adds no counted test.

## Evidence
- `npx playwright test` (default mode): `stats {"expected":0,"skipped":0,"unexpected":0}`, two load errors above.
- `npm run typecheck`: errors in `bookshop-display.spec.ts` (9), `support/db.ts` (11), `book-fixtures.ts` (1), `hotspots.test.ts` (9), `bookshop-display.db.test.ts` (8).

## Fixed by the tester in this pass (tests only, assertions unchanged)
`src/components/bookshop/hotspot-shapes.test.ts`, `tests/e2e/bookshop-highlight.spec.ts` and `tests/e2e/bookshop-fit.spec.ts` now read `DEFAULT_SCENE` and `placedBooks()` instead of the removed exports and column. They are green (see the verification report). The files in the table are the multi-scene feature's to migrate.

## Not related to this report
`scripts/covers/**` (cover-fetch tool): 22 type errors, 4 lint errors (`useScenarioCleanup` called at top level in `scripts/content/backlog.test.ts`, `scripts/covers/cli.test.ts`, `run.test.ts`, `sources.test.ts`) and 1 failing test (`.env.example` lacks `COVERS_CONTACT=`). That feature is in progress and has its own spec, `docs/specs/cover-fetch-tool.md`.
