/* Geometry C — Radial Orbit */
(() => {
  "use strict";

  const tree = document.getElementById("tree");
  const stage = document.getElementById("stage");
  const orbits = document.getElementById("orbits");
  const crumbs = document.getElementById("crumbs");
  const readout = document.getElementById("readout");
  const statebar = document.querySelector(".statebar");

  const SVGNS = "http://www.w3.org/2000/svg";
  const MAX_RING = 3;
  const RING_FILL = 0.94;
  const TAU = Math.PI * 2;

  const ms = (name) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v.endsWith("ms")) return Number.parseFloat(v) || 0;
    if (v.endsWith("s")) return (Number.parseFloat(v) || 0) * 1000;
    return 0;
  };

  const still = () => ms("--dur-slow") === 0;

  const kidsOf = (li) => li.querySelector(":scope > .children");
  const twistyOf = (li) => li.querySelector(":scope > .row > .twisty[aria-expanded]");
  const rowOf = (li) => li.querySelector(":scope > .row") || li.querySelector(":scope > .empty");
  const labelOf = (li) => li.querySelector(":scope > .row > .label");
  const titleOf = (li) => li.querySelector(":scope > .row .title")?.textContent.trim() ?? "";
  const isShelf = (li) => !!twistyOf(li);
  const isOpen = (li) => twistyOf(li)?.getAttribute("aria-expanded") === "true";
  const byId = (id) => tree.querySelector(`.node[data-id="${id}"]`);
  const childNodes = (li) => (kidsOf(li) ? Array.from(kidsOf(li).children) : []);

  const ancestorsOf = (li) => {
    const out = [];
    for (let el = li.parentElement; el && el !== tree; el = el.parentElement) {
      if (el.classList.contains("node")) out.unshift(el);
    }
    return out;
  };

  let currentRoot = byId("root");
  let placements = [];

  /* stable instance keys — two copies of one book share data-id, so ids alone cannot address a node */
  (function key(ul, prefix) {
    Array.from(ul.children).forEach((li, i) => {
      const k = `${prefix}.${i}`;
      li.dataset.key = k;
      const kids = kidsOf(li);
      if (kids) key(kids, k);
    });
  })(tree, "n");

  /* ---------- open / close ---------- */

  function setOpen(li, open) {
    const t = twistyOf(li);
    const ul = kidsOf(li);
    if (!t || !ul) return;
    t.setAttribute("aria-expanded", String(open));
    li.classList.toggle("is-open", open);
    ul.hidden = !open;
  }

  /* ---------- layout ---------- */

  function weightOf(li, depth) {
    if (!isShelf(li) || !isOpen(li) || depth >= MAX_RING) return 1;
    const kids = childNodes(li);
    if (!kids.length) return 1;
    return kids.reduce((sum, k) => sum + weightOf(k, depth + 1), 0);
  }

  function collect(li, depth, a0, a1, out) {
    const kids = childNodes(li);
    if (!kids.length || depth > MAX_RING) return;
    const weights = kids.map((k) => weightOf(k, depth));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const stagger = kids.length > 4;

    let a = a0;
    kids.forEach((k, i) => {
      const span = (a1 - a0) * (weights[i] / total);
      const mid = a + span / 2;
      out.push({ li: k, parent: li, depth, angle: mid, nudge: stagger ? (i % 2 ? 0.055 : -0.055) : 0 });
      if (isShelf(k) && isOpen(k) && depth < MAX_RING) collect(k, depth + 1, a, a + span, out);
      a += span;
    });
  }

  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const rx = Math.max(140, w / 2 - 210);
    const ry = Math.max(110, h / 2 - 54);

    if (!isOpen(currentRoot)) setOpen(currentRoot, true);

    const raw = [];
    collect(currentRoot, 1, -Math.PI / 2, -Math.PI / 2 + TAU, raw);
    const deepest = raw.reduce((m, p) => Math.max(m, p.depth), 1);

    placements = raw.map((p) => {
      const f = (p.depth / deepest) * RING_FILL + p.nudge;
      return { ...p, f, x: cx + rx * f * Math.cos(p.angle), y: cy + ry * f * Math.sin(p.angle) };
    });

    tree.querySelectorAll(".node").forEach((li) => {
      li.classList.remove("is-placed", "node--centre", "node--truncated");
      const row = rowOf(li);
      if (row) row.classList.remove("is-left");
    });

    /* centre */
    currentRoot.classList.add("is-placed", "node--centre");
    const croot = rowOf(currentRoot);
    croot.style.left = cx + "px";
    croot.style.top = cy + "px";

    placements.forEach((p) => {
      const row = rowOf(p.li);
      if (!row) return;
      p.li.classList.add("is-placed");
      const left = Math.cos(p.angle) < 0;
      row.classList.toggle("is-left", left);
      row.style.setProperty("--tx", left ? "-100%" : "0");
      row.style.left = p.x + (left ? -14 : 14) + "px";
      row.style.top = p.y + "px";
      if (isShelf(p.li) && isOpen(p.li) && p.depth >= MAX_RING && childNodes(p.li).length) {
        p.li.classList.add("node--truncated");
      }
    });

    paint(cx, cy, rx, ry, deepest);
    renderCrumbs();
  }

  /* ---------- svg ---------- */

  function el(name, attrs) {
    const node = document.createElementNS(SVGNS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function paint(cx, cy, rx, ry, deepest) {
    orbits.textContent = "";

    for (let d = 1; d <= deepest; d++) {
      const f = (d / deepest) * RING_FILL;
      orbits.appendChild(el("ellipse", { class: "ring", cx, cy, rx: rx * f, ry: ry * f }));
    }

    const at = (p) => ({ x: p.x, y: p.y });
    const find = (li) => placements.find((p) => p.li === li);

    placements.forEach((p) => {
      const parentPlacement = find(p.parent);
      const a = parentPlacement ? at(parentPlacement) : { x: cx, y: cy };
      const ctrlF = parentPlacement ? parentPlacement.f : 0;
      const ctrl = { x: cx + rx * ctrlF * Math.cos(p.angle), y: cy + ry * ctrlF * Math.sin(p.angle) };
      const spoke = el("path", {
        class: "spoke",
        d: `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${p.x} ${p.y}`
      });
      spoke.dataset.to = p.li.dataset.key;
      orbits.appendChild(spoke);
    });

    placements.forEach((p) => {
      const dot = el("circle", {
        class: "dot" + (isShelf(p.li) ? " dot--shelf" : ""),
        cx: p.x, cy: p.y, r: isShelf(p.li) ? 4 : 3
      });
      dot.dataset.for = p.li.dataset.key;
      orbits.appendChild(dot);
    });

    /* chords across the centre, joining copies of one book */
    const groups = new Map();
    placements.forEach((p) => {
      if (!p.li.classList.contains("node--twinned")) return;
      const id = p.li.dataset.bookId;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(p);
    });
    groups.forEach((list) => {
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        orbits.appendChild(el("path", {
          class: "chord",
          d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
        }));
      }
    });
  }

  /* ---------- breadcrumb ---------- */

  function renderCrumbs() {
    crumbs.textContent = "";
    const chain = [...ancestorsOf(currentRoot), currentRoot];
    chain.forEach((li, i) => {
      if (i) {
        const sep = document.createElement("span");
        sep.className = "crumbs__sep";
        sep.textContent = "›";
        sep.setAttribute("aria-hidden", "true");
        crumbs.appendChild(sep);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = titleOf(li);
      if (li === currentRoot) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => reroot(li));
      crumbs.appendChild(b);
    });
  }

  /* ---------- re-root ---------- */

  function reroot(li) {
    if (li === currentRoot) return;
    const go = () => {
      currentRoot = li;
      ancestorsOf(li).forEach((a) => setOpen(a, true));
      setOpen(li, true);
      layout();
    };
    if (still()) { go(); return; }
    tree.classList.add("is-rerooting");
    window.setTimeout(go, ms("--dur-slow") * 0.45);
    window.setTimeout(() => tree.classList.remove("is-rerooting"), ms("--dur-slow") + 40);
  }

  /* ---------- readout ---------- */

  function describe(li) {
    if (!li || !rowOf(li)) return;
    const title = titleOf(li);
    const author = li.querySelector(":scope > .row .author")?.textContent ?? "";
    const year = li.querySelector(":scope > .row .year")?.textContent ?? "";
    const meta = li.querySelector(":scope > .row .meta")?.textContent ?? "";
    const where = ancestorsOf(li).map(titleOf).join(" › ");
    const twin = li.classList.contains("node--twinned");

    readout.replaceChildren();
    const h = document.createElement("p");
    h.className = "readout__title";
    h.textContent = title;
    readout.appendChild(h);

    const m = document.createElement("p");
    m.className = "readout__meta";
    m.textContent = author ? `${author}${year ? " · " + year : ""}` : meta;
    readout.appendChild(m);

    const p = document.createElement("p");
    p.className = "readout__path";
    p.textContent = where || "Top of the tree";
    if (twin) {
      const s = document.createElement("span");
      s.className = "readout__twin";
      s.textContent = " · also shelved elsewhere";
      p.appendChild(s);
    }
    readout.appendChild(p);
  }

  /* ---------- interaction ---------- */

  tree.addEventListener("click", (e) => {
    const t = e.target.closest(".twisty[aria-expanded]");
    if (t) {
      const li = t.closest(".node");
      setOpen(li, !isOpen(li));
      layout();
      clearPresets();
      return;
    }

    const btn = e.target.closest(".twin");
    if (btn) {
      e.preventDefault();
      const here = btn.closest(".node");
      const id = btn.dataset.twinOf;
      const other = Array.from(tree.querySelectorAll(`.node--twinned[data-book-id="${id}"]`)).find((n) => n !== here);
      if (other) {
        const parent = ancestorsOf(other).pop();
        ancestorsOf(other).forEach((a) => setOpen(a, true));
        if (parent && parent !== currentRoot) reroot(parent);
        else layout();
        window.setTimeout(() => {
          labelOf(other)?.focus({ preventScroll: true });
          describe(other);
          other.classList.remove("is-twin-arrived");
          other.getBoundingClientRect();
          other.classList.add("is-twin-arrived");
        }, still() ? 0 : ms("--dur-slow") * 0.6);
      }
      clearPresets();
      return;
    }

    const a = e.target.closest(".label");
    if (a) {
      const li = a.closest(".node");
      if (isShelf(li)) {
        e.preventDefault();
        reroot(li);
      } else {
        describe(li);
      }
      clearPresets();
    }
  });

  const placedNodes = () => [currentRoot, ...placements.map((p) => p.li)].filter((li) => labelOf(li));

  tree.addEventListener("keydown", (e) => {
    const li = e.target.closest(".node");
    if (!li) return;
    const nodes = placedNodes();
    const i = nodes.indexOf(li);

    switch (e.key) {
      case "ArrowDown": e.preventDefault(); focusNode(nodes[Math.min(i + 1, nodes.length - 1)]); break;      case "ArrowUp": e.preventDefault(); focusNode(nodes[Math.max(i - 1, 0)]); break;
      case "ArrowRight":
        e.preventDefault();
        if (isShelf(li) && !isOpen(li)) { setOpen(li, true); layout(); }
        else if (isShelf(li)) focusNode(placedNodes()[i + 1]);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (isShelf(li) && isOpen(li) && li !== currentRoot) { setOpen(li, false); layout(); }
        else if (li === currentRoot) { const up = ancestorsOf(li).pop(); if (up) reroot(up); }
        else focusNode(li.parentElement?.closest(".node"));
        break;
      default: return;
    }
    clearPresets();
  });

  function focusNode(li) {
    if (!li) return;
    labelOf(li)?.focus({ preventScroll: true });
    describe(li);
  }

  /* ---------- twins + lighting ---------- */

  const twinsOf = (id) => Array.from(tree.querySelectorAll(`.node--twinned[data-book-id="${id}"]`));

  function lightSpokes(li) {
    orbits.querySelectorAll(".spoke--lit").forEach((s) => s.classList.remove("spoke--lit"));
    orbits.querySelectorAll(".dot--lit").forEach((s) => s.classList.remove("dot--lit"));
    if (!li) return;
    const chain = [...ancestorsOf(li), li];
    chain.forEach((n) => {
      orbits.querySelector(`.spoke[data-to="${n.dataset.key}"]`)?.classList.add("spoke--lit");
    });
    orbits.querySelector(`.dot[data-for="${li.dataset.key}"]`)?.classList.add("dot--lit");
  }

  tree.addEventListener("focusin", (e) => {
    document.querySelectorAll(".is-twin-lit").forEach((n) => n.classList.remove("is-twin-lit"));
    const li = e.target.closest(".node");
    if (li?.classList.contains("node--twinned")) {
      twinsOf(li.dataset.bookId).forEach((n) => n.classList.add("is-twin-lit"));
    }
    if (li) { describe(li); lightSpokes(li); }
  });

  tree.addEventListener("pointerover", (e) => {
    const li = e.target.closest(".node.is-placed");
    if (!li) return;
    describe(li);
    lightSpokes(li);
    if (li.classList.contains("node--twinned")) {
      twinsOf(li.dataset.bookId).forEach((n) => n.classList.add("is-twin-lit"));
    }
  });

  tree.addEventListener("pointerout", (e) => {
    const li = e.target.closest(".node--twinned");
    if (li && !li.contains(document.activeElement)) {
      twinsOf(li.dataset.bookId).forEach((n) => n.classList.remove("is-twin-lit"));
    }
  });

  /* ---------- presets ---------- */

  const presets = {
    collapsed: { root: "root", open: [] },
    deep: { root: "deep-cuts", open: ["fiction", "speculative", "deep-cuts", "forgotten-imprints", "very-deep"] },
    empty: { root: "root", open: ["unsorted"] },
    twins: { root: "root", open: ["nonfiction", "essays", "poetry"] },
    all: { root: "root", open: null }
  };

  function applyPreset(name) {
    const cfg = presets[name];
    tree.querySelectorAll(".node--shelf").forEach((li) => {
      if (li.classList.contains("node--root")) return;
      setOpen(li, cfg.open === null ? true : cfg.open.includes(li.dataset.id));
    });
    setOpen(byId("root"), true);
    currentRoot = byId(cfg.root);
    ancestorsOf(currentRoot).forEach((a) => setOpen(a, true));
    setOpen(currentRoot, true);
    layout();
    statebar.querySelectorAll("button[data-state]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.state === name))
    );
  }

  function clearPresets() {
    statebar.querySelectorAll("button[aria-pressed='true']").forEach((b) => b.setAttribute("aria-pressed", "false"));
  }

  statebar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-state]");
    if (b) applyPreset(b.dataset.state);
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 80);
  });

  /* ---------- initial state ---------- */

  setOpen(byId("root"), true);
  setOpen(byId("fiction"), true);
  layout();
  window.setTimeout(layout, 120);
})();
