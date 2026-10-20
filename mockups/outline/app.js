/* Geometry A — Indented Outline */
(() => {
  "use strict";

  const tree = document.getElementById("tree");
  const statebar = document.querySelector(".statebar");

  const ms = (name) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v.endsWith("ms")) return Number.parseFloat(v) || 0;
    if (v.endsWith("s")) return (Number.parseFloat(v) || 0) * 1000;
    return 0;
  };

  const kidsOf = (li) => li.querySelector(":scope > .children");
  const twistyOf = (li) => li.querySelector(":scope > .row > .twisty[aria-expanded]");
  const labelOf = (li) => li.querySelector(":scope > .row > .label");
  const isShelf = (li) => !!twistyOf(li);
  const isOpen = (li) => twistyOf(li)?.getAttribute("aria-expanded") === "true";

  const isVisible = (li) => {
    for (let el = li.parentElement; el && el !== tree; el = el.parentElement) {
      if (el.classList.contains("children") && el.hidden) return false;
    }
    return true;
  };

  const visibleNodes = () =>
    Array.from(tree.querySelectorAll(".node")).filter((li) => labelOf(li) && isVisible(li));

  /* ---------- expand / collapse ---------- */

  function setOpen(li, open, { animate = true } = {}) {
    const t = twistyOf(li);
    const ul = kidsOf(li);
    if (!t || !ul) return;
    if (isOpen(li) === open) return;

    t.setAttribute("aria-expanded", String(open));
    li.classList.toggle("is-open", open);

    const d = animate ? ms("--dur-base") : 0;

    if (open) {
      ul.hidden = false;
      Array.from(ul.children).forEach((child, i) => {
        child.style.setProperty("--i", String(Math.min(i, 6)));
      });
      if (d === 0) {
        ul.style.height = "";
        return;
      }
      ul.classList.add("is-opening", "is-anim");
      const target = ul.scrollHeight;
      ul.style.height = "0px";
      requestAnimationFrame(() => {
        ul.style.transition = `height ${d}ms var(--ease-out)`;
        ul.style.height = target + "px";
      });
      window.setTimeout(() => {
        ul.style.transition = "";
        ul.style.height = "";
        ul.classList.remove("is-opening", "is-anim");
      }, d + 30);
    } else {
      if (d === 0) {
        ul.hidden = true;
        ul.style.height = "";
        return;
      }
      ul.classList.add("is-anim");
      ul.style.height = ul.scrollHeight + "px";
      requestAnimationFrame(() => {
        ul.style.transition = `height ${d}ms var(--ease-out)`;
        ul.style.height = "0px";
      });
      window.setTimeout(() => {
        ul.hidden = true;
        ul.style.transition = "";
        ul.style.height = "";
        ul.classList.remove("is-anim");
      }, d + 30);
    }
  }

  tree.addEventListener("click", (e) => {
    const t = e.target.closest(".twisty[aria-expanded]");
    if (!t || !tree.contains(t)) return;
    const li = t.closest(".node");
    setOpen(li, !isOpen(li));
    clearPresets();
  });

  /* clicking a shelf title opens it rather than navigating — these hrefs are placeholders */
  tree.addEventListener("click", (e) => {
    const a = e.target.closest(".label");
    if (!a) return;
    const li = a.closest(".node");
    if (!isShelf(li)) return;
    e.preventDefault();
    setOpen(li, !isOpen(li));
    clearPresets();
  });

  /* ---------- keyboard ---------- */

  tree.addEventListener("keydown", (e) => {
    const li = e.target.closest(".node");
    if (!li) return;
    const nodes = visibleNodes();
    const i = nodes.indexOf(li);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusNode(nodes[Math.min(i + 1, nodes.length - 1)]);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusNode(nodes[Math.max(i - 1, 0)]);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (isShelf(li) && !isOpen(li)) setOpen(li, true);
        else if (isShelf(li)) focusNode(visibleNodes()[i + 1]);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (isShelf(li) && isOpen(li)) setOpen(li, false);
        else focusNode(li.parentElement?.closest(".node"));
        break;
      case "Home":
        e.preventDefault();
        focusNode(nodes[0]);
        break;
      case "End":
        e.preventDefault();
        focusNode(nodes.at(-1));
        break;
      default:
        return;
    }
    clearPresets();
  });

  function focusNode(li) {
    if (!li) return;
    labelOf(li)?.focus();
  }

  /* ---------- multi-shelf twins ---------- */

  const twinsOf = (id) => Array.from(tree.querySelectorAll(`.node--twinned[data-book-id="${id}"]`));

  function lightTwins(id, on) {
    twinsOf(id).forEach((n) => n.classList.toggle("is-twin-lit", on));
  }

  tree.addEventListener("focusin", (e) => {
    const li = e.target.closest(".node--twinned");
    document.querySelectorAll(".is-twin-lit").forEach((n) => n.classList.remove("is-twin-lit"));
    if (li) lightTwins(li.dataset.bookId, true);
  });

  tree.addEventListener("pointerover", (e) => {
    const li = e.target.closest(".node--twinned");
    if (li) lightTwins(li.dataset.bookId, true);
  });

  tree.addEventListener("pointerout", (e) => {
    const li = e.target.closest(".node--twinned");
    if (li && !li.contains(document.activeElement)) lightTwins(li.dataset.bookId, false);
  });

  tree.addEventListener("click", (e) => {
    const btn = e.target.closest(".twin");
    if (!btn) return;
    e.preventDefault();
    const here = btn.closest(".node");
    const id = btn.dataset.twinOf;
    const other = twinsOf(id).find((n) => n !== here);
    if (other) revealAndFocus(other);
    clearPresets();
  });

  function revealAndFocus(li) {
    const chain = [];
    for (let el = li.parentElement; el && el !== tree; el = el.parentElement) {
      if (el.classList.contains("node")) chain.unshift(el);
    }
    chain.forEach((ancestor) => setOpen(ancestor, true, { animate: false }));

    window.requestAnimationFrame(() => {
      labelOf(li)?.focus({ preventScroll: true });
      li.scrollIntoView({ block: "center", behavior: ms("--dur-base") === 0 ? "auto" : "smooth" });
      li.classList.remove("is-twin-arrived");
      li.getBoundingClientRect();
      li.classList.add("is-twin-arrived");
    });
  }

  /* ---------- review state presets ---------- */

  const allShelves = () => Array.from(tree.querySelectorAll(".node--shelf"));
  const byId = (id) => tree.querySelector(`.node[data-id="${id}"]`);

  const presets = {
    collapsed: [],
    deep: ["fiction", "speculative", "deep-cuts", "forgotten-imprints", "very-deep"],
    empty: ["unsorted"],
    twins: ["nonfiction", "essays", "poetry"],
    all: null
  };

  function applyPreset(name) {
    const open = presets[name];
    allShelves().forEach((li) => {
      if (li.classList.contains("node--root")) return;
      const want = open === null ? true : open.includes(li.dataset.id);
      setOpen(li, want, { animate: false });
    });
    setOpen(byId("root"), true, { animate: false });

    statebar.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.state === name));
    });
  }

  function clearPresets() {
    statebar.querySelectorAll("button[aria-pressed='true']").forEach((b) =>
      b.setAttribute("aria-pressed", "false")
    );
  }

  statebar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-state]");
    if (b) applyPreset(b.dataset.state);
  });

  /* ---------- initial state ---------- */

  setOpen(byId("root"), true, { animate: false });
  byId("root").classList.add("is-open");
})();
