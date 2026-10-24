"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./bookshop.module.css";

type Shown = { title: string; author: string };
type Hover = { link: HTMLAnchorElement; x: number; y: number };

const GAP = 12;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

const hotspotOf = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLAnchorElement>("a[data-hotspot]") : null;

/** Keeps the label next to the pointer (hover) or the hotspot (focus), fully inside the scene. */
function placeLabel(label: HTMLDivElement | null, hover: Hover | null, focus: HTMLAnchorElement | null): void {
  const scene = label?.parentElement;
  if (!label || !scene || label.hidden) return;
  const s = scene.getBoundingClientRect();
  const w = label.offsetWidth;
  const h = label.offsetHeight;
  let x = 0;
  let y = 0;
  if (hover) {
    const px = hover.x - s.left;
    const py = hover.y - s.top;
    x = px + GAP + w > s.width ? px - GAP - w : px + GAP;
    y = py - GAP - h < 0 ? py + GAP : py - GAP - h;
  } else if (focus) {
    const r = focus.getBoundingClientRect();
    const right = r.right - s.left + GAP;
    x = right + w > s.width ? r.left - s.left - GAP - w : right;
    y = r.top - s.top + (r.height - h) / 2;
  }
  label.style.transform = `translate(${clamp(x, 0, s.width - w)}px, ${clamp(y, 0, s.height - h)}px)`;
}

/**
 * Decorative title/author label for the hovered or focused hotspot. The links carry the accessible
 * names, so this is aria-hidden. It also hides the hotspots if the artwork fails to load.
 */
export function HotspotLabel() {
  const labelRef = useRef<HTMLDivElement>(null);
  const hover = useRef<Hover | null>(null);
  const focus = useRef<HTMLAnchorElement | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const scene = labelRef.current?.parentElement;
    if (!scene) return;
    const place = () => placeLabel(labelRef.current, hover.current, focus.current);

    const update = () => {
      const link = hover.current?.link ?? focus.current;
      setShown(link ? { title: link.dataset.title ?? "", author: link.dataset.author ?? "" } : null);
      place();
    };

    const onPointerOver = (e: PointerEvent) => {
      const link = hotspotOf(e.target);
      if (!link) return;
      hover.current = { link, x: e.clientX, y: e.clientY };
      update();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!hover.current) return;
      hover.current = { ...hover.current, x: e.clientX, y: e.clientY };
      place();
    };
    const onPointerOut = (e: PointerEvent) => {
      const link = hotspotOf(e.target);
      if (!link || link.contains(e.relatedTarget as Node | null)) return;
      if (hover.current?.link === link) hover.current = null;
      update();
    };
    const onFocusIn = (e: FocusEvent) => {
      focus.current = hotspotOf(e.target);
      update();
    };
    const onFocusOut = () => {
      focus.current = null;
      update();
    };

    scene.addEventListener("pointerover", onPointerOver);
    scene.addEventListener("pointermove", onPointerMove);
    scene.addEventListener("pointerout", onPointerOut);
    scene.addEventListener("focusin", onFocusIn);
    scene.addEventListener("focusout", onFocusOut);

    // The error event may have fired before hydration, so check the current state too.
    const img = scene.querySelector("img");
    const markFailed = () => {
      scene.dataset.imageFailed = "";
    };
    if (img?.complete && img.naturalWidth === 0) markFailed();
    img?.addEventListener("error", markFailed);

    return () => {
      scene.removeEventListener("pointerover", onPointerOver);
      scene.removeEventListener("pointermove", onPointerMove);
      scene.removeEventListener("pointerout", onPointerOut);
      scene.removeEventListener("focusin", onFocusIn);
      scene.removeEventListener("focusout", onFocusOut);
      img?.removeEventListener("error", markFailed);
    };
  }, []);

  // Position after the new text has been laid out, before paint.
  useLayoutEffect(() => {
    placeLabel(labelRef.current, hover.current, focus.current);
  }, [shown]);

  return (
    <div ref={labelRef} className={styles.label} aria-hidden="true" hidden={!shown}>
      {shown ? (
        <>
          <strong className={styles.labelTitle}>{shown.title}</strong>
          <span className={styles.labelAuthor}>by {shown.author}</span>
        </>
      ) : null}
    </div>
  );
}
