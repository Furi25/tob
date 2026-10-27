(() => {
  "use strict";
  const $ = (query) => document.querySelector(query);

  // Master image size. The coordinates below are in master pixels: one polygon per book, as [x, y] points,
  // traced with the polygon editor. They are the same numbers as POLYGONS in src/components/bookshop/scenes/abbey.ts.
  const MASTER = { width: 2752, height: 1536 };
  const DEFAULT_POLYGONS = [
    [[339, 850], [410, 838], [421, 882], [439, 918], [438, 935], [366, 960], [343, 890]],
    [[480, 826], [551, 812], [557, 832], [578, 905], [577, 921], [503, 932], [485, 860]],
    [[603, 781], [686, 768], [693, 773], [702, 830], [714, 861], [717, 874], [628, 896], [620, 870]],
    [[1232, 370], [1292, 370], [1296, 376], [1296, 452], [1226, 452], [1227, 403], [1232, 402]],
    [[1314, 362], [1381, 362], [1385, 367], [1386, 452], [1311, 452], [1311, 404], [1314, 400]],
    [[1492, 367], [1555, 367], [1560, 377], [1560, 452], [1484, 452], [1487, 402], [1491, 398]],
    [[1250, 529], [1313, 529], [1320, 534], [1319, 568], [1316, 620], [1241, 620], [1239, 592], [1243, 560], [1246, 532]],
    [[1337, 540], [1394, 540], [1397, 546], [1397, 620], [1328, 620], [1331, 575], [1337, 571]],
    [[1418, 533], [1477, 533], [1481, 539], [1481, 620], [1414, 620], [1414, 566], [1418, 562]],
    [[1500, 529], [1562, 529], [1571, 535], [1567, 620], [1492, 620], [1495, 576], [1500, 572]],
    [[806, 970], [860, 983], [870, 989], [866, 1008], [850, 1036], [836, 1060], [824, 1098], [800, 1099], [766, 1072], [778, 1033], [792, 998], [801, 976]],
    [[940, 992], [958, 986], [1014, 972], [1019, 983], [1031, 1018], [1043, 1046], [1048, 1080], [1002, 1096], [978, 1098], [962, 1060], [945, 1015]],
    [[1441, 772], [1534, 773], [1536, 893], [1445, 897], [1441, 892]],
    [[1368, 946], [1408, 952], [1424, 958], [1420, 1000], [1422, 1037], [1402, 1039], [1352, 1024], [1347, 1018], [1356, 985], [1363, 950]],
    [[1453, 958], [1520, 957], [1521, 1046], [1453, 1046]],
    [[1543, 957], [1604, 948], [1608, 985], [1619, 1017], [1620, 1024], [1563, 1039], [1557, 1020], [1546, 990]],
    [[1478, 1359], [1597, 1360], [1599, 1380], [1582, 1408], [1566, 1430], [1561, 1448], [1456, 1448], [1426, 1436], [1438, 1414], [1460, 1381]],
    [[2113, 942], [2212, 953], [2230, 958], [2227, 985], [2205, 1060], [2198, 1110], [2150, 1100], [2100, 1085], [2100, 1020], [2108, 960]],
    [[1945, 1202], [2015, 1232], [2022, 1241], [2000, 1312], [1981, 1360], [1976, 1360], [1906, 1318], [1905, 1312], [1925, 1255]],
    [[2062, 1240], [2166, 1247], [2168, 1250], [2164, 1316], [2152, 1378], [2056, 1372], [2052, 1320], [2059, 1250]],
    [[2240, 1240], [2322, 1221], [2332, 1224], [2352, 1270], [2371, 1312], [2362, 1338], [2285, 1376], [2262, 1372], [2248, 1300], [2238, 1250]],
    [[2180, 492], [2262, 492], [2262, 597], [2180, 597]],
    [[2281, 503], [2349, 503], [2349, 594], [2281, 594]],
    [[2375, 509], [2442, 509], [2442, 599], [2375, 599]],
    [[2460, 509], [2527, 509], [2527, 599], [2460, 599]],
    [[2186, 675], [2255, 675], [2255, 770], [2186, 770]],
    [[2278, 669], [2348, 669], [2348, 764], [2278, 764]],
    [[2363, 673], [2432, 673], [2432, 768], [2363, 768]],
    [[2456, 675], [2526, 675], [2526, 768], [2456, 768]]
  ];

  const STORE = "abbey-display-polygons-v1";
  const OLD_BOX_STORE = "abbey-display-boxes-v2";
  const clone = (list) => list.map((poly) => poly.map((p) => [...p]));
  const isPolygon = (p) => Array.isArray(p) && p.length >= 3 && p.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite));
  const boxToPolygon = ([x1, y1, x2, y2]) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (Array.isArray(saved) && saved.length && saved.every(isPolygon)) return saved;
      // Edits made with the old box editor are converted once, so no work is lost.
      const oldBoxes = JSON.parse(localStorage.getItem(OLD_BOX_STORE));
      if (Array.isArray(oldBoxes) && oldBoxes.length && oldBoxes.every((b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite))) {
        return oldBoxes.map(boxToPolygon);
      }
    } catch { /* no storage or bad data: fall back to the polygons saved in this file */ }
    return clone(DEFAULT_POLYGONS);
  };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(polys)); } catch { /* ignore */ } };
  let polys = load();
  let links = [];
  let editing = false, selected = 0, zoom = 0, vertex = -1;
  const hotspots = $("#hotspots");
  const AUTHOR = "Placeholder Author";
  const pad = (n) => String(n).padStart(2, "0");
  const shop = $("#shop"), image = $("#background"), viewport = $("#viewport");
  const tooltip = $("#tooltip"), bookDialog = $("#book-dialog"), indexDialog = $("#index-dialog");
  const status = $("#status"), readout = $("#readout");
  const pct = (value, total) => `${(value / total * 100).toFixed(3)}%`;
  const bounds = (poly) => {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  // The polygon in percent of its own bounding box, for the link's clip-path and the edge svg.
  const localPoints = (poly) => {
    const [x1, y1, x2, y2] = bounds(poly);
    return poly.map(([x, y]) => [(x - x1) / Math.max(1, x2 - x1) * 100, (y - y1) / Math.max(1, y2 - y1) * 100]);
  };

  function setup(link, index) {
    const [x1, y1, x2, y2] = bounds(polys[index]);
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
      outline.setAttribute("pathLength", "100");
      outline.setAttribute("class", name);
      svg.append(outline);
    }
    item.append(svg);
    applyShape(link, svg, index);

    link.addEventListener("pointerenter", (event) => showTooltip(link, event.clientX, event.clientY));
    link.addEventListener("pointermove", (event) => positionTooltip(event.clientX, event.clientY));
    link.addEventListener("pointerleave", hideTooltip);
    link.addEventListener("focus", () => {
      const box = link.getBoundingClientRect();
      showTooltip(link, box.left + box.width / 2, box.top);
    });
    link.addEventListener("blur", hideTooltip);
  }

  // Clip the link to the book's silhouette and draw the edge along it.
  function applyShape(link, svg, index) {
    const local = localPoints(polys[index]);
    link.style.clipPath = `polygon(${local.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(", ")})`;
    const points = local.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    svg.querySelectorAll("polygon").forEach((outline) => outline.setAttribute("points", points));
  }

  function place(index) {
    const [x1, y1, x2, y2] = bounds(polys[index]);
    const item = links[index].parentElement;
    item.style.setProperty("--left", pct(x1, MASTER.width));
    item.style.setProperty("--top", pct(y1, MASTER.height));
    item.style.setProperty("--width", pct(x2 - x1, MASTER.width));
    item.style.setProperty("--height", pct(y2 - y1, MASTER.height));
    links[index].dataset.box = `${x1},${y1} – ${x2},${y2}`;
    applyShape(links[index], item.querySelector("svg"), index);
  }

  function rebuild() {
    hideTooltip();
    hotspots.replaceChildren();
    links = polys.map((_, index) => {
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
  // --- Polygon editor: drag points, add and remove them, move a whole book, then copy the array. ---
  const layer = $("#editor-layer"), panel = $("#editor-panel"), overlay = $("#selection");
  const slot = $("#slot"), fields = [...document.querySelectorAll("#editor-panel [data-axis]")];
  const output = $("#box-output"), overlaps = $("#overlaps"), editToggle = $("#edit-boxes");
  const W = MASTER.width, H = MASTER.height;
  const SVG = "http://www.w3.org/2000/svg";
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Math.round(value)));
  const clampPoint = ([x, y]) => [clamp(x, 0, W), clamp(y, 0, H)];
  const toMaster = (event) => {
    const r = shop.getBoundingClientRect();
    return [(event.clientX - r.left) / r.width * W, (event.clientY - r.top) / r.height * H];
  };
  const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
  // Ray casting, the same test the browser uses for clip-path hits.
  const inside = (poly, x, y) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  // Nearest point on the polygon's edges: which edge to split and where.
  function nearestEdge(poly, x, y) {
    let best = { index: 0, d: Infinity, point: poly[0] };
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const point = [a[0] + t * dx, a[1] + t * dy];
      const d = dist2(x, y, point[0], point[1]);
      if (d < best.d) best = { index: i, d, point };
    });
    return best;
  }
  const handleRadius = () => 7 / Math.max(0.05, shop.offsetWidth / W);

  function syncMapping() {
    const on = markers.getAttribute("aria-pressed") === "true" || editing;
    document.body.classList.toggle("mapping", on);
    readout.hidden = !on;
  }
  function setPolygon(index, poly) {
    polys[index] = poly.map(clampPoint);
    place(index);
    if (index === selected) { drawSelection(); refreshPanel(); }
  }
  function drawSelection() {
    links.forEach((link, i) => link.parentElement.classList.toggle("is-selected", editing && i === selected));
    overlay.replaceChildren();
    const poly = polys[selected];
    if (!poly) return;
    const shape = document.createElementNS(SVG, "polygon");
    shape.setAttribute("points", poly.map((p) => p.join(",")).join(" "));
    shape.setAttribute("class", "sel-shape");
    overlay.append(shape);
    const r = handleRadius();
    poly.forEach(([x, y], i) => {
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", r);
      dot.setAttribute("class", i === vertex ? "sel-dot is-active" : "sel-dot");
      dot.dataset.v = String(i);
      overlay.append(dot);
    });
  }
  function refreshPanel() {
    const poly = polys[selected];
    if (!poly) return;
    slot.value = String(selected);
    const point = poly[vertex];
    fields.forEach((field) => {
      field.disabled = !point;
      field.value = point ? String(point[Number(field.dataset.axis)]) : "";
    });
    $("#vertex-label").textContent = point ? `Point ${vertex + 1} of ${poly.length}` : `${poly.length} points, none selected`;
    const [x1, y1, x2, y2] = bounds(poly);
    const hits = polys.flatMap((o, j) => {
      if (j === selected) return [];
      const [a1, b1, a2, b2] = bounds(o);
      return a1 < x2 && a2 > x1 && b1 < y2 && b2 > y1 ? [pad(j + 1)] : [];
    });
    overlaps.textContent = hits.length ? `Bounding boxes overlap ${hits.join(", ")}` : "No bounding-box overlaps";
    $("#size").textContent = `${x2 - x1} × ${y2 - y1} px, ${poly.length} points`;
    output.value = `[\n${polys.map((o, i) => `  [${o.map((p) => `[${p[0]}, ${p[1]}]`).join(", ")}], // ${pad(i + 1)}`).join("\n")}\n]`;
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
    if (index !== selected) vertex = -1;
    selected = Math.max(0, Math.min(links.length - 1, index));
    drawSelection();
    refreshPanel();
    if (center && editing) {
      const [x1, y1, x2, y2] = bounds(polys[selected]), scale = shop.offsetWidth / W;
      viewport.scrollLeft = shop.offsetLeft + (x1 + x2) / 2 * scale - viewport.clientWidth / 2;
      viewport.scrollTop = shop.offsetTop + (y1 + y2) / 2 * scale - viewport.clientHeight / 2;
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
    if (vertex < 0) return;
    const poly = polys[selected].map((p) => [...p]);
    const axis = Number(field.dataset.axis);
    poly[vertex][axis] = clamp(Number(field.value) || 0, 0, axis ? H : W);
    setPolygon(selected, poly);
    save();
  }));

  function addVertexAt(x, y) {
    const poly = polys[selected].map((p) => [...p]);
    const edge = nearestEdge(poly, x, y);
    poly.splice(edge.index + 1, 0, clampPoint(edge.point));
    vertex = edge.index + 1;
    setPolygon(selected, poly);
    save();
  }
  function removeVertex(at) {
    const poly = polys[selected];
    if (at < 0 || poly.length <= 3) return;
    vertex = Math.min(at, poly.length - 2);
    setPolygon(selected, poly.filter((_, i) => i !== at));
    save();
  }
  $("#add-point").addEventListener("click", () => {
    const poly = polys[selected];
    const i = vertex >= 0 ? vertex : poly.length - 1, a = poly[i], b = poly[(i + 1) % poly.length];
    addVertexAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  });
  $("#remove-point").addEventListener("click", () => removeVertex(vertex));

  let drag = null;
  layer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const [x, y] = toMaster(event), poly = polys[selected], handle = event.target.dataset.v;
    if (handle !== undefined) {
      vertex = Number(handle);
      drag = { mode: "vertex" };
      drawSelection();
      refreshPanel();
    } else if (inside(poly, x, y)) {
      vertex = -1;
      drag = { mode: "move", from: [x, y], start: poly.map((p) => [...p]) };
      drawSelection();
      refreshPanel();
    } else {
      let hit = -1, best = Infinity;
      polys.forEach((o, i) => {
        const [x1, y1, x2, y2] = bounds(o), area = (x2 - x1) * (y2 - y1);
        if (inside(o, x, y) && area < best) { best = area; hit = i; }
      });
      if (hit >= 0) { select(hit); return; }
      vertex = -1;
      drawSelection();
      refreshPanel();
      return;
    }
    layer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  layer.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const [x, y] = toMaster(event);
    if (drag.mode === "vertex") {
      const poly = polys[selected].map((p) => [...p]);
      poly[vertex] = [x, y];
      setPolygon(selected, poly);
    } else {
      const dx = x - drag.from[0], dy = y - drag.from[1];
      const [x1, y1, x2, y2] = bounds(drag.start);
      const ox = Math.round(Math.max(-x1, Math.min(W - x2, dx))), oy = Math.round(Math.max(-y1, Math.min(H - y2, dy)));
      setPolygon(selected, drag.start.map(([px, py]) => [px + ox, py + oy]));
    }
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    save();
  };
  layer.addEventListener("pointerup", endDrag);
  layer.addEventListener("pointercancel", endDrag);
  // Double-click an edge to add a point there, or a point to remove it.
  layer.addEventListener("dblclick", (event) => {
    const handle = event.target.dataset.v;
    if (handle !== undefined) { removeVertex(Number(handle)); return; }
    const [x, y] = toMaster(event);
    const edge = nearestEdge(polys[selected], x, y);
    if (edge.d <= (handleRadius() * 3) ** 2) addVertexAt(x, y);
  });

  document.addEventListener("keydown", (event) => {
    if (!editing || event.target.closest("input, select, textarea, dialog")) return;
    const step = event.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (delta) {
      const poly = polys[selected];
      const [x1, y1, x2, y2] = bounds(poly);
      // One point if one is selected, else the whole polygon (kept inside the picture).
      const dx = vertex >= 0 ? delta[0] : Math.max(-x1, Math.min(W - x2, delta[0]));
      const dy = vertex >= 0 ? delta[1] : Math.max(-y1, Math.min(H - y2, delta[1]));
      setPolygon(selected, poly.map(([px, py], i) => (vertex < 0 || i === vertex ? [px + dx, py + dy] : [px, py])));
      save();
      event.preventDefault();
    } else if (event.key === "Delete" && vertex >= 0) removeVertex(vertex);
    else if (event.key === "Escape") { vertex = -1; drawSelection(); refreshPanel(); }
    else if (event.key === "[") select(selected - 1, true);
    else if (event.key === "]") select(selected + 1, true);
  });

  $("#add-box").addEventListener("click", () => {
    const s = shop.getBoundingClientRect(), v = viewport.getBoundingClientRect();
    const cx = clamp(((v.left + v.width / 2) - s.left) / s.width * W, 40, W - 40);
    const cy = clamp(((v.top + v.height / 2) - s.top) / s.height * H, 55, H - 55);
    polys.push(boxToPolygon([cx - 40, cy - 55, cx + 40, cy + 55]));
    selected = polys.length - 1;
    vertex = -1;
    save();
    rebuild();
    select(selected, true);
  });
  $("#remove-box").addEventListener("click", () => {
    if (polys.length < 2 || !confirm(`Remove ${links[selected].textContent}? Later books are renumbered.`)) return;
    polys.splice(selected, 1);
    vertex = -1;
    save();
    rebuild();
    select(selected, true);
  });
  $("#reset-boxes").addEventListener("click", () => {
    if (!confirm("Discard all edits and restore the 29 polygons saved in app.js?")) return;
    polys = clone(DEFAULT_POLYGONS);
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
