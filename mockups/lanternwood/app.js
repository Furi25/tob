(() => {
  "use strict";

  const tree = document.getElementById("tree");
  const map = document.getElementById("map");
  const stage = document.getElementById("stage");
  const wires = document.getElementById("wires");
  const status = document.getElementById("status");
  const motion = document.getElementById("motion");
  const weather = document.getElementById("weather");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const lightPreference = matchMedia("(prefers-color-scheme: light)");
  const shelves = [...tree.querySelectorAll("[data-shelf]")];
  const nodes = [...tree.querySelectorAll("li:not(.empty)")];
  const twigOf = (node) => node.querySelector(":scope > .twig");
  const linkOf = (node) => twigOf(node).querySelector("a");
  const kidsOf = (node) => node.querySelector(":scope > ul");
  const buttonOf = (node) => twigOf(node).querySelector("button");
  const visible = (node) => !node.closest("[hidden]");
  let scene = "fiction";
  let focusedNode = null;
  let drawPending = false;

  shelves.forEach((node) => {
    const children = kidsOf(node);
    children.id = `children-${node.dataset.shelf}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "disclosure";
    button.setAttribute("aria-controls", children.id);
    button.setAttribute("aria-label", `Toggle ${node.dataset.shelf === "root" ? "Tree of Books" : linkOf(node).firstChild.textContent.trim()}`);
    twigOf(node).append(button);
    setOpen(node, node.hasAttribute("data-open"));
    button.addEventListener("click", () => {
      setOpen(node, children.hidden);
      changeScene(node);
      scheduleWires();
    });
  });

  function setOpen(node, open) {
    const children = kidsOf(node);
    if (!children) return;
    if (!open && children.contains(document.activeElement)) buttonOf(node).focus();
    children.hidden = !open;
    buttonOf(node).setAttribute("aria-expanded", String(open));
    buttonOf(node).textContent = open ? "-" : "+";
  }

  function changeScene(node) {
    const path = [];
    for (let parent = node; parent && tree.contains(parent); parent = parent.parentElement.closest("[data-shelf]")) {
      if (parent.dataset.shelf) path.unshift(parent.dataset.shelf);
    }
    const next = path.includes("speculative") || path.includes("deep-cuts") ? "speculative" : path[1] || "fiction";
    if (scene === next) return;
    scene = next;
    const captions = {
      fiction: "Fiction / a lantern in the pines",
      speculative: "Speculative / a signal beyond the stars",
      "non-fiction": "Non-fiction / the observatory after rain",
      poetry: "Poetry / moonlight over still water",
      unsorted: "Unsorted / a clearing, waiting"
    };
    document.getElementById("scene-caption").textContent = captions[scene];
    status.textContent = captions[scene];
    paint(performance.now());
  }

  function scheduleWires() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => {
      drawPending = false;
      drawWires();
    });
  }

  function drawWires() {
    wires.replaceChildren();
    const bounds = stage.getBoundingClientRect();
    const chain = new Set();
    for (let parent = focusedNode; parent && tree.contains(parent); parent = parent.parentElement.closest("li")) chain.add(parent);
    shelves.forEach((parent) => {
      if (!visible(parent) || kidsOf(parent).hidden) return;
      const a = twigOf(parent).getBoundingClientRect();
      [...kidsOf(parent).children].forEach((child) => {
        const target = twigOf(child) || child;
        const b = target.getBoundingClientRect();
        const x1 = a.right - bounds.left;
        const y1 = a.top + a.height / 2 - bounds.top;
        const x2 = b.left - bounds.left;
        const y2 = b.top + b.height / 2 - bounds.top;
        const bend = (x2 - x1) * .5;
        const wire = document.createElementNS("http://www.w3.org/2000/svg", "path");
        wire.setAttribute("d", `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`);
        wire.setAttribute("class", `wire${chain.has(child) ? " lit" : ""}`);
        wires.append(wire);
      });
    });
  }

  function highlight(node) {
    focusedNode = node;
    tree.querySelectorAll(".twin-lit").forEach((item) => item.classList.remove("twin-lit"));
    if (node?.dataset.bookId) {
      nodes.filter((item) => item.dataset.bookId === node.dataset.bookId).forEach((item) => twigOf(item).classList.add("twin-lit"));
    }
    scheduleWires();
  }

  function reveal(node) {
    for (let parent = node.parentElement.closest("[data-shelf]"); parent; parent = parent.parentElement.closest("[data-shelf]")) setOpen(parent, true);
    scheduleWires();
    requestAnimationFrame(() => {
      // Scroll only the map, keeping the page and its controls in place.
      const rect = twigOf(node).getBoundingClientRect();
      const viewport = map.getBoundingClientRect();
      map.scrollTo({
        left: map.scrollLeft + rect.left - viewport.left - Math.max(30, (map.clientWidth - rect.width) / 2),
        top: map.scrollTop + rect.top - viewport.top - (map.clientHeight - rect.height) / 2,
        behavior: reduced.matches || motion.checked ? "instant" : "smooth"
      });
      linkOf(node).focus({ preventScroll: true });
    });
  }

  function selectBook(node) {
    tree.querySelectorAll(".selected").forEach((item) => item.classList.remove("selected"));
    twigOf(node).classList.add("selected");
    const link = linkOf(node);
    const title = link.firstChild.textContent.trim();
    document.getElementById("note-title").textContent = title;
    document.getElementById("note-author").textContent = link.querySelector("small").textContent;
    const parent = node.parentElement.closest("[data-shelf]");
    document.getElementById("note-shelf").textContent = linkOf(parent).firstChild.textContent.trim();
    document.getElementById("note-description").textContent = link.querySelector(".shared")
      ? `One book, more than one path. ${link.querySelector(".shared").textContent}. Both instances glow when either is focused.`
      : "A small discovery in your reading landscape. Stay a while, or follow another branch.";
    document.getElementById("note-link").href = link.getAttribute("href");
    document.querySelector(".book-cover > span:first-child").textContent = title.split(/\s+/).slice(0, 2).map((word) => word[0]).join(" ");
    document.querySelector(".book-cover > span:last-child").textContent = "A PLACE IN YOUR LIBRARY";
    status.textContent = `Selected ${title}.`;
  }

  tree.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const node = link.closest("li");
    changeScene(node);
    if (node.dataset.shelf) {
      setOpen(node, kidsOf(node).hidden);
      scheduleWires();
    } else selectBook(node);
  });
  tree.addEventListener("focusin", (event) => highlight(event.target.closest("li")));
  tree.addEventListener("pointerover", (event) => highlight(event.target.closest("li")));
  tree.addEventListener("pointerleave", () => highlight(tree.contains(document.activeElement) ? document.activeElement.closest("li") : null));
  tree.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(event.key)) return;
    const node = event.target.closest("li");
    if (!node) return;
    event.preventDefault();
    const list = nodes.filter(visible);
    const index = list.indexOf(node);
    if (event.key === "ArrowDown") reveal(list[Math.min(index + 1, list.length - 1)]);
    if (event.key === "ArrowUp") reveal(list[Math.max(index - 1, 0)]);
    if (event.key === "ArrowRight") {
      if (kidsOf(node)?.hidden) setOpen(node, true);
      else if (kidsOf(node)?.firstElementChild.matches("li:not(.empty)")) reveal(kidsOf(node).firstElementChild);
    }
    if (event.key === "ArrowLeft") {
      if (kidsOf(node) && !kidsOf(node).hidden) setOpen(node, false);
      else {
        const parent = node.parentElement.closest("[data-shelf]");
        if (parent) reveal(parent);
      }
    }
    scheduleWires();
  });

  document.getElementById("note-link").addEventListener("click", () => {
    const href = document.getElementById("note-link").getAttribute("href");
    const matches = nodes.filter((node) => linkOf(node).getAttribute("href") === href);
    reveal(matches.find(visible) || matches[0]);
  });
  document.getElementById("home").addEventListener("click", () => {
    shelves.forEach((node) => setOpen(node, node.hasAttribute("data-open")));
    changeScene(shelves[0]);
    map.scrollTo({ left: 0, top: 0, behavior: "instant" });
    status.textContent = "Returned to the clearing.";
    scheduleWires();
  });
  new ResizeObserver(scheduleWires).observe(stage);
  window.addEventListener("resize", scheduleWires);

  const canvas = document.getElementById("landscape");
  const context = canvas.getContext("2d");
  if (!context) {
    status.textContent = "This browser cannot draw the pixel landscape. The library still works.";
    console.error("Lanternwood: Canvas 2D is unavailable.");
    motion.disabled = true;
    weather.disabled = true;
  }
  const W = 480;
  const H = 320;
  canvas.width = W;
  canvas.height = H;
  if (context) context.imageSmoothingEnabled = false;
  const isLight = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "light"
    : lightPreference.matches;
  const themeButton = document.getElementById("theme");
  function themeLabel() {
    themeButton.textContent = isLight() ? "Evening palette" : "Morning palette";
  }
  themeButton.addEventListener("click", () => {
    document.documentElement.dataset.theme = isLight() ? "dark" : "light";
    themeLabel();
    paint(performance.now());
  });
  lightPreference.addEventListener("change", () => { themeLabel(); paint(performance.now()); });
  themeLabel();

  const palettes = {
    fiction: ["#152c32", "#355357", "#284547", "#163b35", "#0c2825", "#779583", "#edca82"],
    speculative: ["#20263f", "#515472", "#3b4460", "#263649", "#172333", "#96a5bd", "#e0c0e8"],
    "non-fiction": ["#222f3b", "#566570", "#3e5358", "#2b4245", "#172e31", "#94aaa8", "#e9c796"],
    poetry: ["#2c3041", "#685d72", "#4a5262", "#354851", "#24363e", "#b2b0b4", "#f3d4a0"],
    unsorted: ["#243a36", "#637c68", "#426053", "#304b3c", "#1e362b", "#9eaf8a", "#ecd49e"]
  };
  function random(seed) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  function rect(x, y, width, height, color) {
    context.fillStyle = color;
    context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }
  function pine(x, y, height, color, rng) {
    rect(x - 1, y - height, 2, height, color);
    for (let tier = 0; tier < 7; tier++) {
      const half = 3 + tier * height / 28;
      const top = y - height + tier * height / 9;
      rect(x - half, top, half * 2, height / 7, color);
      rect(x - half - 2, top + 3, half * 2 + 4, 2, color);
      if (rng() > .5) rect(x + half, top + 3, 3, 1, color);
    }
  }
  function paint(time) {
    if (!context) return;
    const rng = random(617);
    const p = palettes[scene];
    const still = reduced.matches || motion.checked;
    const t = still ? 0 : time / 1000;
    const light = isLight();
    const sky = context.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, light ? "#8daba8" : p[0]);
    sky.addColorStop(.65, light ? "#b3c3af" : p[1]);
    sky.addColorStop(1, p[2]);
    context.fillStyle = sky;
    context.fillRect(0, 0, W, H);

    for (let i = 0; i < 65; i++) {
      const x = rng() * W;
      const y = rng() * 150;
      context.globalAlpha = light ? .25 : .3 + .25 * Math.sin(t * .5 + i);
      rect(x, y, 1, 1, "#e4e0bd");
    }
    context.globalAlpha = 1;
    rect(373, 29, 13, 23, light ? "#f1e9c9" : "#c1cec3");
    rect(369, 33, 21, 15, light ? "#f1e9c9" : "#c1cec3");
    rect(369, 29, 12, 16, light ? "#93afa9" : p[0]);

    for (let layer = 0; layer < 3; layer++) {
      for (let x = 0; x < W; x += 4) {
        const y = 135 + layer * 24 + Math.sin(x / (38 - layer * 5) + layer * 3) * 17 + rng() * 6;
        rect(x, y, 4, H - y, p[layer + 2]);
      }
      for (let i = 0; i < 20; i++) {
        const x = rng() * W;
        const y = 169 + layer * 30 + rng() * 17;
        pine(x, y, 30 + rng() * 48, p[layer + 2], rng);
      }
    }

    // The river is laid down in stepped bands, not smoothed vector curves.
    for (let y = 228; y < H; y += 2) {
      const center = 336 + Math.sin(y / 34) * 17;
      const width = 7 + (y - 228) * 1.3;
      rect(center - width / 2, y, width, 2, light ? "#7e9f9b" : "#426164");
      for (let i = 0; i < 3; i++) {
        const x = center + (rng() - .5) * width;
        context.globalAlpha = .1 + .13 * (1 + Math.sin(t * .7 + y));
        rect(x, y, rng() * 12 + 2, 1, p[5]);
      }
      context.globalAlpha = 1;
    }

    // A warm refuge anchors each genre, while the architecture changes.
    const cabinX = scene === "poetry" ? 391 : 363;
    const cabinY = 192;
    rect(cabinX, cabinY, 42, 30, "#263c38");
    rect(cabinX + 2, cabinY + 2, 38, 27, "#3f5144");
    for (let step = 0; step < 9; step++) rect(cabinX - 7 + step * 3, cabinY - step * 2, 56 - step * 6, 3, "#1b3030");
    if (scene === "non-fiction" || scene === "speculative") {
      for (let step = 0; step < 7; step++) rect(cabinX + step * 2, cabinY - 13 - step * 2, 40 - step * 4, 3, p[5]);
      rect(cabinX + 19, cabinY - 37, 2, 18, p[5]);
    }
    const glow = context.createRadialGradient(cabinX + 23, cabinY + 16, 2, cabinX + 23, cabinY + 16, 40);
    glow.addColorStop(0, "#e5bd774c");
    glow.addColorStop(1, "#e5bd7700");
    context.fillStyle = glow;
    context.fillRect(cabinX - 20, cabinY - 25, 85, 85);
    const breathe = .86 + .1 * Math.sin(t * .8);
    context.globalAlpha = breathe;
    rect(cabinX + 7, cabinY + 9, 8, 10, p[6]);
    rect(cabinX + 27, cabinY + 9, 8, 10, p[6]);
    rect(cabinX + 19, cabinY + 13, 5, 17, "#d0ad72");
    context.globalAlpha = 1;
    rect(cabinX + 10, cabinY + 9, 1, 10, "#6b654c");
    rect(cabinX + 30, cabinY + 9, 1, 10, "#6b654c");

    for (let i = 0; i < 18; i++) pine(rng() * W, 285 + rng() * 50, 50 + rng() * 55, p[4], rng);
    for (let i = 0; i < 28; i++) {
      const x = rng() * W + Math.sin(t * .16 + i) * 3;
      const y = 194 + rng() * 120 + Math.cos(t * .19 + i) * 2;
      context.globalAlpha = .35 + .3 * Math.sin(t * .65 + i);
      rect(x, y, 1, 1, p[6]);
      context.globalAlpha *= .12;
      rect(x - 1, y - 1, 3, 3, p[6]);
    }
    context.globalAlpha = 1;
    // Wide, low-opacity cloud illumination; never a full-screen strobe.
    if (!still && weather.checked) {
      const phase = t % 23;
      const strength = phase > 17 && phase < 21 ? Math.sin((phase - 17) / 4 * Math.PI) : 0;
      context.globalAlpha = strength * .10;
      rect(240, 0, 240, 140, "#c5cfeb");
      context.globalAlpha = strength * .20;
      [[425, 50, 1, 8], [422, 58, 3, 1], [421, 59, 1, 6], [418, 65, 4, 1], [418, 66, 1, 7]].forEach((bolt) => rect(...bolt, "#d3dded"));
      context.globalAlpha = 1;
    }
    for (let i = 0; i < 5; i++) {
      const x = ((t * (i % 2 ? -.7 : .5) + i * 93) % 600 + 600) % 600 - 60;
      context.globalAlpha = light ? .09 : .045;
      rect(x, 175 + i * 25, 170, 5, "#c0d1c0");
      rect(x + 23, 180 + i * 25, 130, 3, "#c0d1c0");
    }
    context.globalAlpha = 1;
  }

  let frame = 0;
  let lastPaint = 0;
  function tick(time) {
    if (time - lastPaint > 80) {
      paint(time);
      lastPaint = time;
    }
    frame = requestAnimationFrame(tick);
  }
  function syncAnimation() {
    cancelAnimationFrame(frame);
    paint(performance.now());
    if (context && !motion.checked && !reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
  }
  motion.checked = reduced.matches;
  motion.addEventListener("change", syncAnimation);
  weather.addEventListener("change", () => paint(performance.now()));
  reduced.addEventListener("change", () => { motion.checked = reduced.matches; syncAnimation(); });
  document.addEventListener("visibilitychange", syncAnimation);
  syncAnimation();
  scheduleWires();
})();
