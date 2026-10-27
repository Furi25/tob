# multiple-scenes e2e: tests read the book list too early, and one assertion throws on a null href

- **Severity**: minor
- **Spec**: docs/specs/multiple-bookshop-scenes.md, criteria #25 and #27 (tests, not product code)
- **Affected**: `tests/e2e/multiple-scenes.spec.ts`

## Steps to Reproduce
1. `npx playwright test tests/e2e/multiple-scenes.spec.ts -g "#27"` and `-g "#25"`.

## Expected
Tests pass or fail on what the page does.

## Actual
1. **Book list captured before `beforeAll` runs.** In `test.describe("hotspot behaviour on every scene")` (around line 597), `const list = booksOf(scene)` runs while Playwright collects tests, but `placed` is filled in `beforeAll`. `list` is always `[]`. Effects:
   - `#27 <scene>: one edge svg and one ring svg per book` fails with `Expected: 0 Received: 25` (bookshop) and `Received: 29` (abbey).
   - `#27 <scene> slot N` (6 tests) fail with `<scene>: no book in slot N`.
   - `#27 <scene>: Tab visits the books in slot order 1→N` **passes without testing anything**: the loop runs while `visited.length < 0` and compares `[]` with `[]`.
2. **`#25 <url> at a 375px / 839px window ... hidden, unfocusable and not clickable`** (4 tests) throws `TypeError: expect(received).not.toMatch(expected) — received value must be a string, Received has value: null` at line 559. `activeHref()` returns `null` when focus is on `<body>`, which is the correct result for these windows, but the assertion cannot take `null`.

## Evidence
- Run of `multiple-scenes.spec.ts`: 77 passed, 2 skipped, 13 failed. Of the 13, 12 are the two causes above and 1 is the Abbey target-size bug (separate report).
- Same 8 `#27` failures when run alone with `-g "#27"`, so they do not depend on test order.

## Fix (tests only)
Read the list lazily, for example `const list = () => booksOf(scene)`, or build it inside each test; assert `list.length > 0` first. Use `(await activeHref(page)) ?? ""` in the `not.toMatch` check.
