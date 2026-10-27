# Abbey slots 8 and 9 fail WCAG 2.5.8 spacing at the 808px breakpoint

- **Severity**: minor
- **Spec**: docs/specs/multiple-bookshop-scenes.md, criterion #25 (breakpoint and target size, "as BD #13"); docs/specs/bookshop-display.md, criterion #13
- **Affected**: `src/components/bookshop/scenes/abbey.ts` (slots 8 and 9), the global 808px breakpoint in `src/components/bookshop/bookshop.module.css`

## Steps to Reproduce
1. Open `/shops/abbey` in a window 840px wide and 1024px high, so the scene is 808px wide and the hotspots just appear.
2. Measure the hotspot links for slots 8 and 9, or run the tests below.

## Expected
Every hotspot is at least 24×24 CSS px, or has a 24px circle around its centre that touches no other target's circle (WCAG 2.5.8). The spec says that when a scene fails at 808px the global value goes up and the spec is updated.

## Actual
```
slot 8 (20.2×23.9): spacing circle intersects the circle of slot 9
slot 9 (21.8×25.7): spacing circle intersects the circle of slot 8
```
Slot 8 is 20.2px wide (under 24) and its circle overlaps slot 9's. At scene widths of 1280px and 1920px the same scene passes. The bookshop scene passes at all three widths.

## Evidence
- `src/components/bookshop/scenes/scenes.test.ts` > `scene abbey > #25 at a scene width of 808px every hotspot meets WCAG 2.5.8 (as BD #13)`
- `tests/e2e/multiple-scenes.spec.ts` > `#25 /shops/abbey at a scene width of 808px every hotspot meets WCAG 2.5.8 (as BD #13)` (`expect(targetSizeFailures(targets)).toEqual([])`, received the two lines above)

## Decision needed
Raise the global breakpoint (the amount the scene must grow before slots 8 and 9 reach spacing is a calculation for the architect) or fix the Abbey rectangles for slots 8 and 9 if they are too tight. Either way, the spec and the window-fit "Narrow scenes" text change too.
