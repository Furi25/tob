// Spec: docs/specs/multiple-bookshop-scenes.md — criteria #1 #2 #3 #4 #8 and the geometry half of #25.
// Also encodes the Abbey's decided values (Scope, Resolved decisions) and its 29 hand-measured boxes (Appendix).
//
// ASSUMED MODULE PATH. The spec shows the registry as `src/components/bookshop/scenes/index.ts` exporting SCENES,
// DEFAULT_SCENE_ID and getScene(id). The spec calls the layout illustrative; if the implementer picks another path,
// change the one import below.
// These tests are red until that module exists.
import { describe, expect, it } from "vitest";
import { targetSizeFailures } from "../../../../tests/e2e/support/target-size";
import { ABBEY_BOXES, ABBEY_MASTER_SIZE, ABBEY_SLOT_COUNT } from "../../../../tests/support/abbey-boxes";
import { BOOKSHOP_V1_ARTWORK, BOOKSHOP_V1_HOTSPOTS } from "../../../../tests/support/bookshop-v1";
import { overlapArea, polygonArea, selfCrossings, toArtworkPx } from "../../../../tests/support/polygons";
import { DEFAULT_SCENE_ID, SCENES, getScene } from "./index";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Two silhouettes "overlap" when they share more than this many artwork px²; shared borders and rounding don't count. */
const OVERLAP_TOLERANCE_PX2 = 4;
const scenes = [...SCENES];

describe("#1 the registry", () => {
  it("lists at least two scenes, with bookshop first and as the default", () => {
    expect(scenes.length).toBeGreaterThanOrEqual(2);
    expect(scenes[0].id).toBe("bookshop");
    expect(DEFAULT_SCENE_ID).toBe("bookshop");
  });

  it("uses unique kebab-case ids", () => {
    const ids = scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, `id "${id}"`).toMatch(KEBAB);
  });

  it("gives every scene a non-empty name and alt, and no two scenes share an alt", () => {
    for (const s of scenes) {
      expect(s.name.trim(), `${s.id} name`).not.toBe("");
      expect(s.alt.trim(), `${s.id} alt`).not.toBe("");
    }
    const alts = scenes.map((s) => s.alt);
    expect(new Set(alts).size, `alts: ${JSON.stringify(alts)}`).toBe(alts.length);
  });

  it("keeps bookshop's artwork exactly as it is today: 2752×1536, version v1, widths 1376/2064/2752", () => {
    const s = getScene("bookshop");
    expect(s?.artwork.size).toEqual(BOOKSHOP_V1_ARTWORK.size);
    expect(s?.artwork.version).toBe(BOOKSHOP_V1_ARTWORK.version);
    expect([...(s?.artwork.widths ?? [])]).toEqual([...BOOKSHOP_V1_ARTWORK.widths]);
  });

  it("keeps bookshop's 25 hotspots (slot, rectangle and shape) exactly as they are today", () => {
    const s = getScene("bookshop");
    const actual = (s?.hotspots ?? []).map((h) => ({ slot: h.slot, rect: h.rect, shape: h.shape }));
    expect(actual).toEqual(BOOKSHOP_V1_HOTSPOTS.map((h) => ({ slot: h.slot, rect: h.rect, shape: h.shape })));
  });

  it("makes zone optional: every hotspot has a string zone or none", () => {
    for (const s of scenes) {
      for (const h of s.hotspots) {
        expect(["string", "undefined"], `${s.id} slot ${h.slot} zone`).toContain(typeof h.zone);
      }
    }
  });
});

describe("The Abbey (Scope, Resolved decisions, Appendix)", () => {
  const abbey = getScene("abbey");

  it("is registered as 'The Abbey' with the alt text \"The abbey's library\"", () => {
    expect(abbey, "scene 'abbey' is registered").toBeDefined();
    expect(abbey?.name).toBe("The Abbey");
    expect(abbey?.alt).toBe("The abbey's library");
  });

  it("uses docs/scenes/gothic.png at 2752×1536 with widths 1376, 2064 and 2752", () => {
    expect(abbey?.artwork.master.replaceAll("\\", "/")).toBe("docs/scenes/gothic.png");
    expect(abbey?.artwork.size).toEqual(ABBEY_MASTER_SIZE);
    expect([...(abbey?.artwork.widths ?? [])]).toEqual([1376, 2064, 2752]);
  });

  it("ships the 29 mapped books", () => {
    expect(abbey?.hotspots).toHaveLength(ABBEY_SLOT_COUNT);
  });

  describe.each(Object.entries(ABBEY_BOXES).map(([slot, box]) => [Number(slot), box] as const))(
    "slot %i matches its appendix box",
    (slot, [x1, y1, x2, y2]) => {
      const { width: W, height: H } = ABBEY_MASTER_SIZE;
      // 0.1% of the artwork, in master px. Rounding outwards may add up to this much on each side (criterion 5).
      const stepX = W / 1000;
      const stepY = H / 1000;
      const eps = 0.01;

      it("has a rectangle that contains the box and is at most one 0.1% step larger on each side", () => {
        const h = abbey?.hotspots.find((x) => x.slot === slot);
        expect(h, `slot ${slot} exists`).toBeDefined();
        if (!h) return;
        const left = (h.rect.left / 100) * W;
        const right = ((h.rect.left + h.rect.width) / 100) * W;
        const top = (h.rect.top / 100) * H;
        const bottom = ((h.rect.top + h.rect.height) / 100) * H;
        expect(x1 - left, "left side").toBeGreaterThanOrEqual(-eps);
        expect(x1 - left, "left side").toBeLessThanOrEqual(stepX + eps);
        expect(right - x2, "right side").toBeGreaterThanOrEqual(-eps);
        expect(right - x2, "right side").toBeLessThanOrEqual(stepX + eps);
        expect(y1 - top, "top side").toBeGreaterThanOrEqual(-eps);
        expect(y1 - top, "top side").toBeLessThanOrEqual(stepY + eps);
        expect(bottom - y2, "bottom side").toBeGreaterThanOrEqual(-eps);
        expect(bottom - y2, "bottom side").toBeLessThanOrEqual(stepY + eps);
      });

      it("has a 4-point shape whose corners map back to the box within 0.5 master px", () => {
        const h = abbey?.hotspots.find((x) => x.slot === slot);
        expect(h, `slot ${slot} exists`).toBeDefined();
        if (!h) return;
        expect(h.shape).toHaveLength(4);
        const px = toArtworkPx(h, ABBEY_MASTER_SIZE);
        for (const [cx, cy] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] as const) {
          const nearest = Math.min(...px.map(([x, y]) => Math.hypot(x - cx, y - cy)));
          expect(nearest, `corner (${cx}, ${cy})`).toBeLessThanOrEqual(0.5);
        }
      });
    },
  );
});

describe.each(scenes.map((s) => [s.id, s] as const))("scene %s", (_id, scene) => {
  const N = scene.hotspots.length;
  const size = scene.artwork.size;

  it("#2 has at least one hotspot and uses each slot 1..N exactly once", () => {
    expect(N).toBeGreaterThanOrEqual(1);
    const slots = scene.hotspots.map((h) => h.slot).sort((a, b) => a - b);
    expect(slots).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it("#3 every rectangle has a positive size and stays within 0–100 on both axes", () => {
    for (const { slot, rect } of scene.hotspots) {
      const what = `slot ${slot}`;
      expect(rect.top, `${what} top`).toBeGreaterThanOrEqual(0);
      expect(rect.left, `${what} left`).toBeGreaterThanOrEqual(0);
      expect(rect.width, `${what} width`).toBeGreaterThan(0);
      expect(rect.height, `${what} height`).toBeGreaterThan(0);
      expect(rect.left + rect.width, `${what} right edge`).toBeLessThanOrEqual(100 + 1e-9);
      expect(rect.top + rect.height, `${what} bottom edge`).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it("#3 every shape has 3+ points inside 0–100, a non-zero area and no self-crossing edges", () => {
    for (const { slot, shape } of scene.hotspots) {
      const what = `slot ${slot}`;
      expect(shape.length, `${what} point count`).toBeGreaterThanOrEqual(3);
      for (const [x, y] of shape) {
        expect(x, `${what} x`).toBeGreaterThanOrEqual(0);
        expect(x, `${what} x`).toBeLessThanOrEqual(100);
        expect(y, `${what} y`).toBeGreaterThanOrEqual(0);
        expect(y, `${what} y`).toBeLessThanOrEqual(100);
      }
      expect(polygonArea(shape), `${what} area`).toBeGreaterThan(0);
      expect(selfCrossings(shape), `${what} crossing edges`).toEqual([]);
    }
  });

  it("#4 no two silhouettes overlap, measured in artwork pixels (overlapping rectangles are allowed)", () => {
    const polygons = scene.hotspots.map((h) => ({ slot: h.slot, px: toArtworkPx(h, size) }));
    const overlapping: string[] = [];
    for (let i = 0; i < polygons.length; i++) {
      for (let j = i + 1; j < polygons.length; j++) {
        const area = overlapArea(polygons[i].px, polygons[j].px);
        if (area > OVERLAP_TOLERANCE_PX2) overlapping.push(`${polygons[i].slot}↔${polygons[j].slot} (${area.toFixed(1)} px²)`);
      }
    }
    expect(overlapping).toEqual([]);
  });

  // Geometry only: CSS px of each hotspot's rectangle at a given scene width, then BD #13's rule.
  // The e2e spec repeats the shown/hidden half in a browser (tests/e2e/multiple-scenes.spec.ts).
  it.each([808, 1280, 1920])("#25 at a scene width of %ipx every hotspot meets WCAG 2.5.8 (as BD #13)", (sceneWidth) => {
    const sceneHeight = (sceneWidth * size.height) / size.width;
    const targets = scene.hotspots.map((h) => ({
      name: `slot ${h.slot}`,
      box: {
        x: (h.rect.left / 100) * sceneWidth,
        y: (h.rect.top / 100) * sceneHeight,
        width: (h.rect.width / 100) * sceneWidth,
        height: (h.rect.height / 100) * sceneHeight,
      },
    }));
    expect(targetSizeFailures(targets)).toEqual([]);
  });
});

describe("#8 getScene(id)", () => {
  it.each(scenes.map((s) => s.id))("returns the registered scene for %s", (id) => {
    expect(getScene(id)?.id).toBe(id);
  });

  it.each(["", "__proto__", "constructor", "toString", "hasOwnProperty", "BOOKSHOP", "Abbey", " abbey", "abbey ", "nope", "../abbey"])(
    "returns undefined for %j",
    (id) => {
      expect(getScene(id)).toBeUndefined();
    },
  );
});
