// Spec: docs/specs/bookshop-scene-scaling.md, criteria #6 (sizes has no 1920px term) and the "no cap" scope.
// The browser half of #6 (which file is requested at 3440×1440) is in tests/e2e/bookshop-scene-scaling.spec.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookShell } from "@/components/book/BookShell";
import { OPEN_BOOK } from "@/components/book/openBook";
import { BookshopScene } from "./BookshopScene";
import { SCENES } from "./scenes";

const sizesOf = (html: string): string => {
  const match = /<img[^>]*\ssizes="([^"]*)"/.exec(html);
  if (!match) throw new Error("no <img sizes> in the markup");
  return match[1];
};

describe("shop scene `sizes` (bookshop-scene-scaling.md #6)", () => {
  it.each(SCENES.map((s) => s.id))("%s: sizes has no 1920px term and keeps the width and height limits", (id) => {
    const scene = SCENES.find((s) => s.id === id)!;
    const sizes = sizesOf(renderToStaticMarkup(createElement(BookshopScene, { scene, books: [], showOverlay: false })));
    const { width, height } = scene.artwork.size;

    expect(sizes).not.toContain("1920");
    expect(sizes.replace(/\s+/g, "")).toBe(`min(calc(100vw-32px),calc((100vh-96px)*${width}/${height}))`);
  });
});

describe("open-book stage `sizes` (bookshop-scene-scaling.md UI Surface)", () => {
  it("has no 1920px term and keeps the width and height limits", () => {
    const html = renderToStaticMarkup(
      createElement(BookShell, {
        palette: { primary: "#5a2a0a", surface: "#fff6dc", text: "#2a1a0a", highlight: "#7a2e0a" },
        left: null,
        right: null,
      }),
    );
    const sizes = sizesOf(html);
    expect(sizes).not.toContain("1920");
    expect(sizes).toContain("100vw");
    expect(sizes).toContain(`${OPEN_BOOK.size.width} / ${OPEN_BOOK.size.height}`);
  });
});

describe("stylesheets carry no 1920px cap (bookshop-scene-scaling.md Scope)", () => {
  it.each(["bookshop/bookshop.module.css", "book/book.module.css"])("%s has no 1920px", (file) => {
    const css = readFileSync(path.join(process.cwd(), "src", "components", file), "utf8");
    expect(css).not.toMatch(/1920px/);
  });
});
