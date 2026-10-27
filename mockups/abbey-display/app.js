(() => {
  "use strict";
  const $ = (query) => document.querySelector(query);

  // Master image size. The coordinates below are in master pixels, [x1, y1, x2, y2],
  // measured by hand with the box editor (2026-10-25). Edit this array to correct the mapping.
  const MASTER = { width: 2752, height: 1536 };
  const DEFAULT_BOXES = [
    [330, 843, 443, 970],
    [470, 814, 578, 933],
    [601, 769, 718, 888],
    [1228, 373, 1290, 455],
    [1310, 355, 1382, 455],
    [1481, 369, 1552, 455],
    [1235, 527, 1312, 621],
    [1327, 543, 1394, 623],
    [1405, 537, 1476, 623],
    [1493, 533, 1563, 615],
    [761, 968, 865, 1089],
    [951, 964, 1052, 1103],
    [1440, 769, 1540, 894],
    [1351, 943, 1413, 1046],
    [1454, 958, 1520, 1054],
    [1548, 943, 1620, 1046],
    [1437, 1355, 1600, 1448],
    [2086, 937, 2229, 1120],
    [1903, 1200, 2010, 1355],
    [2044, 1237, 2157, 1386],
    [2235, 1226, 2366, 1376],
    [2180, 492, 2262, 597],
    [2281, 503, 2349, 594],
    [2375, 509, 2442, 599],
    [2460, 509, 2527, 599],
    [2186, 675, 2255, 770],
    [2278, 669, 2348, 764],
    [2363, 673, 2432, 768],
    [2456, 675, 2526, 768]
  ];

  const STORE = "abbey-display-boxes-v2";
  const clone = (list) => list.map((box) => [...box]);
  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (Array.isArray(saved) && saved.length && saved.every((b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite))) return saved;
    } catch { /* no storage or bad data: fall back to the boxes as received */ }
    return clone(DEFAULT_BOXES);
  };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(boxes)); } catch { /* ignore */ } };
  let boxes = load();
  let links = [];
  let editing = false, selected = 0, zoom = 0;
  const hotspots = $("#hotspots");
  const AUTHOR = "Placeholder Author";
  const pad = (n) => String(n).padStart(2, "0");
  const shop = $("#shop"), image = $("#background"), viewport = $("#viewport");
  const tooltip = $("#tooltip"), bookDialog = $("#book-dialog"), indexDialog = $("#index-dialog");
  const status = $("#status"), readout = $("#readout");
  const pct = (value, total) => `${(value / total * 100).toFixed(3)}%`;

  function setup(link, index) {
    const [x1, y1, x2, y2] = boxes[index];
    const item = link.parentElement;
    item.style.setProperty("--left", pct(x1, MASTER.width));
    item.style.setProperty("--top", pct(y1, MASTER.height));
    item.style.setProperty("--width", pct(x2 - x1, MASTER.width));
    item.style.setProperty("--height", pct(y2 - y1, MASTER.height));
    link.dataset.number = String(index + 1);
    link.dataset.box = `${x1},${y1} – ${x2},${y2}`;
    link.setAttribute("aria-label", `${index + 1}. ${link.textContent}, by ${link.dataset.author}`);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("sparkle-edge");
    svg.style.setProperty("--delay", `${-index * 0.37}s`);
    for (const name of ["edge-base", "edge-glint"]) {
      const outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      outline.setAttribute("points", "0,0 100,0 100,100 0,100");
      outline.setAttribute("pathLength", "100");
      outline.setAttribute("class", name);
      svg.append(outline);
    }
    item.append(svg);

    link.addEventListener("pointerenter", (event) => showTooltip(link, event.clientX, event.clientY));
    link.addEventListener("pointermove", (event) => positionTooltip(event.clientX, event.clientY));
    link.addEventListener("pointerleave", hideTooltip);
    link.addEventListener("focus", () => {
      const box = link.getBoundingClientRect();
      showTooltip(link, box.left + box.width / 2, box.top);
    });
    link.addEventListener("blur", hideTooltip);
  }

  function place(index) {
    const [x1, y1, x2, y2] = boxes[index];
    const item = links[index].parentElement;
    item.style.setProperty("--left", pct(x1, MASTER.width));
    item.style.setProperty("--top", pct(y1, MASTER.height));
    item.style.setProperty("--width", pct(x2 - x1, MASTER.width));
    item.style.setProperty("--height", pct(y2 - y1, MASTER.height));
    links[index].dataset.box = `${x1},${y1} – ${x2},${y2}`;
  }

  function rebuild() {
    hideTooltip();
    hotspots.replaceChildren();
    links = boxes.map((_, index) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#book/${index + 1}`;
      link.textContent = `Abbey Placeholder ${pad(index + 1)}`;
      link.dataset.author = AUTHOR;
      item.append(link);
      hotspots.append(item);
      setup(link, index);
      return link;
    });
    hotspots.setAttribute("aria-label", `Explore ${links.length} books`);
    $("#open-index").innerHTML = `All ${links.length} books &#8599;`;
    buildIndex();
    if (selected >= links.length) selected = links.length - 1;
    buildSlotOptions();
    drawSelection();
    refreshPanel();
  }

  // --- Fit: fill the viewport (crops edges) or show the whole scene (letterboxed). ---
  let fillScreen = false;
  function fit() {
    if (!image.naturalWidth) return;
    const pick = fillScreen && !editing ? Math.max : Math.min;
    const height = viewport.clientHeight - (editing ? 112 : 0);
    const scale = editing && zoom > 0 ? zoom : pick(viewport.clientWidth / image.naturalWidth, height / image.naturalHeight);
    shop.style.width = `${image.naturalWidth * scale}px`;
    shop.style.height = `${image.naturalHeight * scale}px`;
    hideTooltip();
  }
  $("#fit-scene").addEventListener("click", (event) => {
    fillScreen = !fillScreen;
    event.currentTarget.setAttribute("aria-pressed", String(fillScreen));
    event.currentTarget.textContent = fillScreen ? "Full scene" : "Fill screen";
    fit();
  });
  image.addEventListener("load", () => { shop.hidden = false; $("#image-error").hidden = true; fit(); });
  image.addEventListener("error", () => { shop.hidden = true; $("#image-error").hidden = false; });
  new ResizeObserver(fit).observe(viewport);
  if (image.complete && image.naturalWidth) fit();

  // --- Tooltip (viewport coordinates) ---
  function hideTooltip() { tooltip.hidden = true; }
  function positionTooltip(x, y) {
    const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    const maxX = viewport.clientWidth - w - 4, maxY = viewport.clientHeight - h - 4;
    tooltip.style.left = `${Math.max(4, Math.min(x + 12, maxX))}px`;
    tooltip.style.top = `${Math.max(4, Math.min(y - h - 12 < 4 ? y + 16 : y - h - 12, maxY))}px`;
  }
  function showTooltip(link, x, y) {
    if (editing) return;
    $("#tooltip-title").textContent = link.textContent;
    $("#tooltip-author").textContent = `by ${link.dataset.author}`;
    status.textContent = `${link.textContent} · ${link.dataset.author}`;
    tooltip.hidden = false;
    positionTooltip(x, y);
  }

  // --- Mapping review: red boxes, plus a cursor readout in master pixels. ---
  const markers = $("#markers");
  markers.addEventListener("click", () => {
    const on = markers.getAttribute("aria-pressed") !== "true";
    markers.setAttribute("aria-pressed", String(on));
    syncMapping();
  });
  shop.addEventListener("pointermove", (event) => {
    if (readout.hidden) return;
    const box = shop.getBoundingClientRect();
    const x = Math.round((event.clientX - box.left) / box.width * MASTER.width);
    const y = Math.round((event.clientY - box.top) / box.height * MASTER.height);
    readout.textContent = `x ${x} · y ${y}`;
  });

  // --- Book dialog ---
  const open = (n) => {
    const link = links[n - 1];
    if (!link) return;
    $("#record").textContent = `SLOT ${String(n).padStart(2, "0")} OF ${links.length}`;
    $("#book-title").textContent = link.textContent;
    $("#book-author").textContent = link.dataset.author;
    $("#purchase").setAttribute("aria-expanded", "false");
    $("#affiliate-note").hidden = true;
    if (indexDialog.open) indexDialog.close();
    if (!bookDialog.open) bookDialog.showModal();
  };
  const fromHash = () => {
    const match = /^#book\/(\d+)$/.exec(location.hash);
    if (match) open(Number(match[1]));
    else if (bookDialog.open) bookDialog.close();
  };
  window.addEventListener("hashchange", fromHash);
  bookDialog.addEventListener("close", () => {
    if (location.hash.startsWith("#book/")) history.replaceState(null, "", location.pathname + location.search);
  });
  $("#purchase").addEventListener("click", (event) => {
    const note = $("#affiliate-note");
    note.hidden = !note.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!note.hidden));
  });

  // --- Index dialog ---
  function buildIndex() {
    $("#index-list").replaceChildren(...links.map((link, index) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#book/${index + 1}`;
      a.textContent = link.textContent;
      const small = document.createElement("small");
      small.textContent = link.dataset.author;
      a.append(small);
      li.append(a);
      return li;
    }));
  }
  $("#open-index").addEventListener("click", () => indexDialog.showModal());
  for (const dialog of [bookDialog, indexDialog]) {
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  }
  // --- Box editor: draw, move and resize boxes in master pixels, then copy the array. ---
  const layer = $("#editor-layer"), panel = $("#editor-panel"), selBox = $("#selection");
  const slot = $("#slot"), fields = [...document.querySelectorAll("#editor-panel [data-edge]")];
  const output = $("#box-output"), overlaps = $("#overlaps"), editToggle = $("#edit-boxes");
  const W = MASTER.width, H = MASTER.height;
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Math.round(value)));
  const normalize = (ax, ay, bx, by) => [clamp(Math.min(ax, bx), 0, W), clamp(Math.min(ay, by), 0, H), clamp(Math.max(ax, bx), 0, W), clamp(Math.max(ay, by), 0, H)];
  const contains = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  const toMaster = (event) => {
    const r = shop.getBoundingClientRect();
    return [(event.clientX - r.left) / r.width * W, (event.clientY - r.top) / r.height * H];
  };

  function syncMapping() {
    const on = markers.getAttribute("aria-pressed") === "true" || editing;
    document.body.classList.toggle("mapping", on);
    readout.hidden = !on;
  }
  function setBox(index, box) {
    boxes[index] = box;
    place(index);
    if (index === selected) { drawSelection(); refreshPanel(); }
  }
  function drawSelection() {
    links.forEach((link, i) => link.parentElement.classList.toggle("is-selected", editing && i === selected));
    const b = boxes[selected];
    if (!b) return;
    selBox.style.left = pct(b[0], W);
    selBox.style.top = pct(b[1], H);
    selBox.style.width = pct(b[2] - b[0], W);
    selBox.style.height = pct(b[3] - b[1], H);
  }
  function refreshPanel() {
    const b = boxes[selected];
    if (!b) return;
    slot.value = String(selected);
    fields.forEach((field) => { field.value = String(b[Number(field.dataset.edge)]); });
    const hits = boxes.flatMap((o, j) => (j !== selected && o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1] ? [pad(j + 1)] : []));
    overlaps.textContent = hits.length ? `Overlaps ${hits.join(", ")}` : "No overlaps";
    $("#size").textContent = `${b[2] - b[0]} × ${b[3] - b[1]} px`;
    output.value = boxes.map((o, i) => `[${o.join(", ")}], // ${pad(i + 1)}`).join("\n");
  }
  function buildSlotOptions() {
    slot.replaceChildren(...links.map((link, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = link.textContent;
      return option;
    }));
  }
  function select(index, center) {
    selected = Math.max(0, Math.min(links.length - 1, index));
    drawSelection();
    refreshPanel();
    if (center && editing) {
      const b = boxes[selected], scale = shop.offsetWidth / W;
      viewport.scrollLeft = shop.offsetLeft + (b[0] + b[2]) / 2 * scale - viewport.clientWidth / 2;
      viewport.scrollTop = shop.offsetTop + (b[1] + b[3]) / 2 * scale - viewport.clientHeight / 2;
    }
  }
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("editing", on);
    layer.hidden = panel.hidden = !on;
    editToggle.setAttribute("aria-pressed", String(on));
    syncMapping();
    hideTooltip();
    fit();
    if (on) select(selected, true);
    else { viewport.scrollTo(0, 0); drawSelection(); }
  }

  editToggle.addEventListener("click", () => setEditing(!editing));
  slot.addEventListener("change", () => select(Number(slot.value), true));
  $("#prev").addEventListener("click", () => select(selected - 1, true));
  $("#next").addEventListener("click", () => select(selected + 1, true));
  $("#zoom").addEventListener("change", (event) => { zoom = Number(event.target.value); fit(); select(selected, true); });
  fields.forEach((field) => field.addEventListener("change", () => {
    const edge = Number(field.dataset.edge);
    const b = [...boxes[selected]];
    b[edge] = clamp(Number(field.value) || 0, 0, edge % 2 ? H : W);
    setBox(selected, normalize(b[0], b[1], b[2], b[3]));
    save();
  }));

  let drag = null;
  layer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const [x, y] = toMaster(event), b = boxes[selected], handle = event.target.dataset.h;
    if (handle) {
      drag = { mode: "resize", ax: handle.includes("w") ? b[2] : b[0], ay: handle.includes("n") ? b[3] : b[1] };
    } else if (contains(b, x, y)) {
      drag = { mode: "move", dx: x - b[0], dy: y - b[1], w: b[2] - b[0], h: b[3] - b[1] };
    } else {
      let hit = -1, best = Infinity;
      boxes.forEach((o, i) => {
        const area = (o[2] - o[0]) * (o[3] - o[1]);
        if (contains(o, x, y) && area < best) { best = area; hit = i; }
      });
      if (hit >= 0) { select(hit); return; }
      drag = { mode: "draw", ax: x, ay: y, before: [...b] };
    }
    layer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  layer.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const [x, y] = toMaster(event);
    if (drag.mode === "move") {
      const left = clamp(x - drag.dx, 0, W - drag.w), top = clamp(y - drag.dy, 0, H - drag.h);
      setBox(selected, [left, top, left + drag.w, top + drag.h]);
    } else {
      setBox(selected, normalize(drag.ax, drag.ay, x, y));
    }
  });
  const endDrag = () => {
    if (!drag) return;
    const b = boxes[selected];
    if (drag.mode === "draw" && (b[2] - b[0] < 4 || b[3] - b[1] < 4)) setBox(selected, drag.before);
    drag = null;
    save();
  };
  layer.addEventListener("pointerup", endDrag);
  layer.addEventListener("pointercancel", endDrag);

  document.addEventListener("keydown", (event) => {
    if (!editing || event.target.closest("input, select, textarea, dialog")) return;
    const step = event.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (delta) {
      const b = boxes[selected], w = b[2] - b[0], h = b[3] - b[1];
      const left = clamp(b[0] + delta[0], 0, W - w), top = clamp(b[1] + delta[1], 0, H - h);
      setBox(selected, [left, top, left + w, top + h]);
      save();
      event.preventDefault();
    } else if (event.key === "[") select(selected - 1, true);
    else if (event.key === "]") select(selected + 1, true);
  });

  $("#add-box").addEventListener("click", () => {
    const s = shop.getBoundingClientRect(), v = viewport.getBoundingClientRect();
    const cx = clamp(((v.left + v.width / 2) - s.left) / s.width * W, 40, W - 40);
    const cy = clamp(((v.top + v.height / 2) - s.top) / s.height * H, 55, H - 55);
    boxes.push([cx - 40, cy - 55, cx + 40, cy + 55]);
    selected = boxes.length - 1;
    save();
    rebuild();
    select(selected, true);
  });
  $("#remove-box").addEventListener("click", () => {
    if (boxes.length < 2 || !confirm(`Remove ${links[selected].textContent}? Later books are renumbered.`)) return;
    boxes.splice(selected, 1);
    save();
    rebuild();
    select(selected, true);
  });
  $("#reset-boxes").addEventListener("click", () => {
    if (!confirm("Discard all edits and restore the 29 boxes saved in app.js?")) return;
    boxes = clone(DEFAULT_BOXES);
    selected = 0;
    save();
    rebuild();
    select(0, true);
  });
  $("#copy-boxes").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    output.select();
    try { await navigator.clipboard.writeText(output.value); button.textContent = "Copied"; }
    catch { button.textContent = "Press Ctrl+C"; }
    setTimeout(() => { button.textContent = "Copy array"; }, 1500);
  });

  rebuild();
  fromHash();
})();
