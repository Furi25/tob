/* Geometry B — Horizontal Branching Tree */
(() => {
  "use strict";

  const tree = document.getElementById("tree");
  const stage = document.getElementById("stage");
  const viewport = document.getElementById("viewport");
  const wires = document.getElementById("wires");
  const statebar = document.querySelector(".statebar");
  const pathfocus = document.getElementById("pathfocus");
  const crosslinks = document.getElementById("crosslinks");

  const SVGNS = "http://www.w3.org/2000/svg";

  const ms = (name) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v.endsWith("ms")) return Number.parseFloat(v) || 0;
    if (v.endsWith("s")) return (Number.parseFloat(v) || 0) * 1000;
    return 0;
  };

  const still = () => ms("--dur-base") === 0;

  const kidsOf = (li) => li.querySelector(":scope > .children");
  const twistyOf = (li) => li.querySelector(":scope > .row > .twisty[aria-expanded]");
  const labelOf = (li) => li.querySelector(":scope > .row > .label");
  const boxOf = (li) => li.querySelector(":scope > .row") || li.querySelector(":scope > .empty");
  const isShelf = (li) => !!twistyOf(li);
  const isOpen = (li) => twistyOf(li)?.getAttribute("aria-expanded") === "true";
  const byId = (id) => tree.querySelector(`.node[data-id="${id}"]`);

  const isVisible = (li) => {
    for (let el = li.parentElement; el && el !== tree; el = el.parentElement) {
      if (el.classList.contains("children") && el.hidden) return false;
    }
    return true;
  };

  const visibleNodes = () =>
    Array.from(tree.querySelectorAll(".node")).filter((li) => labelOf(li) && isVisible(li));

  /* stable instance keys, so a connector can be reused across redraws */
  (function key(ul, prefix) {
    Array.from(ul.children).forEach((li, i) => {
      const k = `${prefix}.${i}`;
      li.dataset.key = k;
      const kids = kidsOf(li);
      if (kids) key(kids, k);
    });
  })(tree, "n");

  const ancestorsOf = (li) => {
    const out = [];
    for (let el = li.parentElement; el && el !== tree; el = el.parentElement) {
      if (el.classList.contains("node")) out.unshift(el);
    }
    return out;
  };

  /* ---------- expand / collapse ---------- */

  function setOpen(li, open, { animate = true, enforcePath = true } = {}) {
    const t = twistyOf(li);
    const ul = kidsOf(li);
    if (!t || !ul) return;

    if (open && enforcePath && pathfocus.checked) {
      const parentUl = li.parentElement;
      if (parentUl && parentUl.classList.contains("children")) {
        Array.from(parentUl.children).forEach((sib) => {
          if (sib !== li && isShelf(sib) && isOpen(sib)) setOpen(sib, false, { animate: false, enforcePath: false });
        });
      }
    }

    if (isOpen(li) === open) return;

    t.setAttribute("aria-expanded", String(open));
    li.classList.toggle("is-open", open);

    if (open) {
      ul.hidden = false;
      Array.from(ul.children).forEach((child, i) => child.style.setProperty("--i", String(Math.min(i, 6))));
      if (animate && !still()) {
        ul.classList.add("is-opening");
        window.setTimeout(() => ul.classList.remove("is-opening"), ms("--dur-slow") + ms("--dur-base") + 260);
      }
    } else {
      ul.hidden = true;
    }
  }

  function openPathTo(li, opts) {
    ancestorsOf(li).forEach((a) => setOpen(a, true, opts));
  }

  /* ---------- connectors ---------- */

  const live = new Map();

  function redraw() {
    const sr = stage.getBoundingClientRect();
    const needed = new Set();

    const point = (el, side) => {
      const r = el.getBoundingClientRect();
      return {
        x: (side === "right" ? r.right : r.left) - sr.left,
        y: r.top + r.height / 2 - sr.top
      };
    };

    tree.querySelectorAll(".node").forEach((li) => {
      if (!isOpen(li) || !isVisible(li)) return;
      const parentBox = boxOf(li);
      const ul = kidsOf(li);
      if (!parentBox || !ul || ul.hidden) return;
      const a = point(parentBox, "right");

      Array.from(ul.children).forEach((child) => {
        const childBox = boxOf(child);
        if (!childBox) return;
        const b = point(childBox, "left");
        const k = `${li.dataset.key}>${child.dataset.key}`;
        needed.add(k);
        const dx = Math.max(24, (b.x - a.x) * 0.55);
        const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
        upsert(k, d, "wire");
      });
    });

    if (crosslinks.checked) {
      const groups = new Map();
      tree.querySelectorAll(".node--twinned").forEach((li) => {
        if (!isVisible(li)) return;
        const id = li.dataset.bookId;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(li);
      });
      groups.forEach((list, id) => {
        if (list.length < 2) return;
        for (let i = 1; i < list.length; i++) {
          const a = point(boxOf(list[i - 1]), "right");
          const b = point(boxOf(list[i]), "right");
          const bow = Math.max(64, Math.abs(b.y - a.y) * 0.35);
          const k = `twin:${id}:${i}`;
          needed.add(k);
          const d = `M ${a.x} ${a.y} C ${a.x + bow} ${a.y}, ${b.x + bow} ${b.y}, ${b.x} ${b.y}`;
          upsert(k, d, "wire wire--twin");
        }
      });
    }

    live.forEach((el, k) => {
      if (!needed.has(k)) {
        el.remove();
        live.delete(k);
      }
    });

    lightPath(document.activeElement?.closest?.(".node") || null);
  }

  function upsert(key, d, cls) {
    let el = live.get(key);
    if (el) {
      el.setAttribute("d", d);
      return el;
    }
    el = document.createElementNS(SVGNS, "path");
    el.setAttribute("class", cls);
    el.setAttribute("d", d);
    wires.appendChild(el);
    live.set(key, el);

    if (!still() && !cls.includes("wire--twin")) {
      const len = el.getTotalLength();
      el.style.setProperty("--len", len);
      el.style.strokeDasharray = len;
      el.classList.add("wire--grow");
      window.setTimeout(() => {
        el.classList.remove("wire--grow");
        el.style.strokeDasharray = "";
      }, ms("--dur-slow") + 60);
    }
    return el;
  }

  function lightPath(li) {
    live.forEach((el) => el.classList.remove("wire--lit"));
    tree.querySelectorAll(".node--onpath").forEach((n) => n.classList.remove("node--onpath"));
    if (!li) return;
    const chain = [...ancestorsOf(li), li];
    chain.forEach((n) => n.classList.add("node--onpath"));
    for (let i = 1; i < chain.length; i++) {
      live.get(`${chain[i - 1].dataset.key}>${chain[i].dataset.key}`)?.classList.add("wire--lit");
    }
  }

  const schedule = () => requestAnimationFrame(() => requestAnimationFrame(redraw));

  /* ---------- bring into view ---------- */

  function bringIntoView(el) {
    if (!el) return;
    const vr = viewport.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const pad = 40;
    let dx = 0, dy = 0;
    if (er.right > vr.right - pad) dx = er.right - (vr.right - pad);
    else if (er.left < vr.left + pad) dx = er.left - (vr.left + pad);
    if (er.bottom > vr.bottom - pad) dy = er.bottom - (vr.bottom - pad);
    else if (er.top < vr.top + pad) dy = er.top - (vr.top + pad);
    if (dx || dy) viewport.scrollBy({ left: dx, top: dy, behavior: still() ? "auto" : "smooth" });
  }

  /* ---------- interaction ---------- */

  tree.addEventListener("click", (e) => {
    const t = e.target.closest(".twisty[aria-expanded]");
    if (t) {
      const li = t.closest(".node");
      setOpen(li, !isOpen(li));
      schedule();
      if (isOpen(li)) requestAnimationFrame(() => bringIntoView(kidsOf(li)));
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
        if (pathfocus.checked) pathfocus.checked = false;
        openPathTo(other, { animate: false, enforcePath: false });
        schedule();
        requestAnimationFrame(() => {
          labelOf(other)?.focus({ preventScroll: true });
          bringIntoView(boxOf(other));
          other.classList.remove("is-twin-arrived");
          other.getBoundingClientRect();
          other.classList.add("is-twin-arrived");
        });
      }
      clearPresets();
      return;
    }

    const a = e.target.closest(".label");
    if (a) {
      const li = a.closest(".node");
      if (!isShelf(li)) return;
      e.preventDefault();
      setOpen(li, !isOpen(li));
      schedule();
      if (isOpen(li)) requestAnimationFrame(() => bringIntoView(kidsOf(li)));
      clearPresets();
    }
  });

  tree.addEventListener("keydown", (e) => {
    const li = e.target.closest(".node");
    if (!li) return;
    const nodes = visibleNodes();
    const i = nodes.indexOf(li);

    switch (e.key) {
      case "ArrowDown": e.preventDefault(); focusNode(nodes[Math.min(i + 1, nodes.length - 1)]); break;
      case "ArrowUp": e.preventDefault(); focusNode(nodes[Math.max(i - 1, 0)]); break;
      case "ArrowRight":
        e.preventDefault();
        if (isShelf(li) && !isOpen(li)) { setOpen(li, true); schedule(); requestAnimationFrame(() => bringIntoView(kidsOf(li))); }
        else if (isShelf(li)) focusNode(visibleNodes()[i + 1]);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (isShelf(li) && isOpen(li)) { setOpen(li, false); schedule(); }
        else focusNode(li.parentElement?.closest(".node"));
        break;
      case "Home": e.preventDefault(); focusNode(nodes[0]); break;
      case "End": e.preventDefault(); focusNode(nodes.at(-1)); break;
      default: return;
    }
    clearPresets();
  });

  function focusNode(li) {
    if (!li) return;
    labelOf(li)?.focus({ preventScroll: true });
    bringIntoView(boxOf(li));
  }

  /* ---------- twins ---------- */

  const twinsOf = (id) => Array.from(tree.querySelectorAll(`.node--twinned[data-book-id="${id}"]`));

  tree.addEventListener("focusin", (e) => {
    document.querySelectorAll(".is-twin-lit").forEach((n) => n.classList.remove("is-twin-lit"));
    const li = e.target.closest(".node--twinned");
    if (li) twinsOf(li.dataset.bookId).forEach((n) => n.classList.add("is-twin-lit"));
    lightPath(e.target.closest(".node"));
  });

  tree.addEventListener("pointerover", (e) => {
    const li = e.target.closest(".node--twinned");
    if (li) twinsOf(li.dataset.bookId).forEach((n) => n.classList.add("is-twin-lit"));
  });

  tree.addEventListener("pointerout", (e) => {
    const li = e.target.closest(".node--twinned");
    if (li && !li.contains(document.activeElement)) {
      twinsOf(li.dataset.bookId).forEach((n) => n.classList.remove("is-twin-lit"));
    }
  });

  /* ---------- presets ---------- */

  const presets = {
    collapsed: [],
    deep: ["fiction", "speculative", "deep-cuts", "forgotten-imprints", "very-deep"],
    empty: ["unsorted"],
    twins: ["nonfiction", "essays", "poetry"],
    all: null
  };

  function applyPreset(name) {
    const open = presets[name];
    if (name === "twins" || name === "all") pathfocus.checked = false;

    tree.querySelectorAll(".node--shelf").forEach((li) => {
      if (li.classList.contains("node--root")) return;
      const want = open === null ? true : open.includes(li.dataset.id);
      setOpen(li, want, { animate: false, enforcePath: false });
    });
    setOpen(byId("root"), true, { animate: false, enforcePath: false });

    statebar.querySelectorAll("button[data-state]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.state === name))
    );
    schedule();
  }

  function clearPresets() {
    statebar.querySelectorAll("button[aria-pressed='true']").forEach((b) => b.setAttribute("aria-pressed", "false"));
  }

  statebar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-state]");
    if (b) applyPreset(b.dataset.state);
  });

  crosslinks.addEventListener("change", redraw);
  pathfocus.addEventListener("change", () => {
    if (!pathfocus.checked) return;
    const focused = document.activeElement?.closest?.(".node");
    if (focused) {
      const keep = new Set([...ancestorsOf(focused), focused]);
      tree.querySelectorAll(".node--shelf.is-open").forEach((li) => {
        if (!keep.has(li) && !li.classList.contains("node--root")) setOpen(li, false, { animate: false, enforcePath: false });
      });
      schedule();
    }
  });

  window.addEventListener("resize", schedule);

  /* ---------- initial state ---------- */

  byId("root").classList.add("is-open");
  setOpen(byId("fiction"), true, { animate: false });
  schedule();
  window.setTimeout(redraw, 120);
})();
