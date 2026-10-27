// WCAG 2.5.8 Target Size (Minimum), as used by criterion 13 of docs/specs/bookshop-display.md.
// Same rule as the helper inside tests/e2e/bookshop-display.spec.ts, shared here for the window-fit spec.

export type Box = { x: number; y: number; width: number; height: number };
export type Target = { name: string; box: Box };

const MIN = 24;

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const undersized = (b: Box) => b.width < MIN || b.height < MIN;
const circleHitsRect = (c: { x: number; y: number }, b: Box) => {
  const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.width));
  const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.height));
  return dx * dx + dy * dy < (MIN / 2) ** 2;
};

/**
 * A target passes if it is at least 24×24, or if a 24px-diameter circle centred on its bounding box
 * intersects no other target and no other undersized target's circle. Returns one line per failure.
 */
export function targetSizeFailures(targets: Target[]): string[] {
  const failures: string[] = [];
  for (const t of targets) {
    if (!undersized(t.box)) continue;
    const c = centre(t.box);
    const size = `${t.box.width.toFixed(1)}×${t.box.height.toFixed(1)}`;
    for (const o of targets) {
      if (o === t) continue;
      if (circleHitsRect(c, o.box)) {
        failures.push(`${t.name} (${size}): spacing circle intersects ${o.name}`);
      } else if (undersized(o.box)) {
        const oc = centre(o.box);
        if (Math.hypot(c.x - oc.x, c.y - oc.y) < MIN) {
          failures.push(`${t.name} (${size}): spacing circle intersects the circle of ${o.name}`);
        }
      }
    }
  }
  return failures;
}

export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
