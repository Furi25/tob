(() => {
  "use strict";
  const $ = (query) => document.querySelector(query);
  const links = [...document.querySelectorAll("#hotspots a")];
  // Visually traced from the supplied PNG, in percentage image coordinates.
  // Each visible book owns one polygonal link; the old guide rectangles are replaced.
  const positions = [
    [2.8, 79.2, 5.6, 9.4, "polygon(0 0,62% 5%,100% 96%,12% 100%)"],
    [8.7, 79.1, 6.1, 10.8, "polygon(0 0,72% 5%,100% 94%,24% 100%)"],
    [14.7, 79.4, 5.1, 11.2, "polygon(0 0,74% 5%,100% 94%,22% 100%)"],
    [19.6, 80.6, 6.1, 11.1, "polygon(0 0,74% 3%,100% 94%,22% 100%)"],
    [26.0, 81.0, 6.4, 11.6, "polygon(0 0,75% 5%,100% 94%,22% 100%)"],
    [26.5, 33.9, 3.3, 7.0, "polygon(6% 0,100% 0,94% 100%,0 100%)"],
    [27.7, 43.9, 2.2, 5.9, "polygon(8% 0,100% 0,94% 100%,0 100%)"],
    [17.3, 49.8, 3.1, 5.7, "polygon(0 14%,80% 0,100% 85%,20% 100%)"],
    [35.1, 80.9, 8.7, 6.4, "polygon(0 64%,31% 0,58% 10%,78% 3%,100% 49%,91% 91%,51% 100%)"],
    [39.1, 65.9, 5.6, 4.8, "polygon(0 51%,40% 0,69% 5%,100% 51%,57% 100%,18% 84%)"],
    [41.8, 42.6, 3.3, 7.1, "polygon(0 8%,82% 0,100% 94%,12% 100%)"],
    [70.9, 63.0, 5.8, 11.5, "polygon(21% 0,100% 13%,74% 100%,0 87%)"],
    [78.5, 59.7, 5.2, 11.2, "polygon(0 10%,72% 0,100% 87%,23% 100%)"],
    [82.6, 57.1, 5.6, 10.3, "polygon(0 10%,70% 0,100% 84%,25% 100%)"],
    [68.9, 75.6, 4.9, 10.6, "polygon(22% 0,100% 13%,78% 100%,0 85%)"],
    [80.6, 71.8, 4.5, 7.6, "polygon(0 11%,62% 0,100% 87%,26% 100%)"],
    [84.4, 70.8, 4.8, 10.4, "polygon(0 12%,64% 0,100% 84%,27% 100%)"],
    [88.6, 66.5, 4.1, 10.5, "polygon(0 12%,65% 0,100% 85%,29% 100%)"],
    [68.0, 87.4, 5.1, 10.1, "polygon(21% 0,100% 11%,80% 100%,0 85%)"],
    [73.5, 91.1, 4.6, 8.9, "polygon(17% 0,100% 11%,85% 100%,0 90%)"],
    [56.4, 46.1, 3.3, 6.8, "polygon(22% 0,100% 13%,79% 100%,0 88%)"],
    [59.5, 46.8, 3.3, 7.2, "polygon(23% 0,100% 13%,77% 100%,0 87%)"],
    [62.5, 47.7, 3.3, 7.3, "polygon(25% 0,100% 13%,77% 100%,0 87%)"],
    [65.5, 49.5, 3.3, 7.3, "polygon(25% 0,100% 13%,77% 100%,0 87%)"],
    [52.1, 24.1, 3.5, 6.7, "polygon(16% 0,100% 5%,85% 100%,0 97%)"]
  ];
  links.forEach((link, index) => {
    const [left, top, width, height, shape] = positions[index];
    const item = link.parentElement;
    Object.entries({ left, top, width, height }).forEach(([key, value]) => item.style.setProperty(`--${key}`, `${value}%`));
    link.style.setProperty("--shape", shape);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("sparkle-edge");
    svg.style.setProperty("--delay", `${-index * .37}s`);
    const points = shape.slice(8, -1).split(",").map((pair) => pair.trim().replaceAll("%", "").split(/\s+/).join(",")).join(" ");
    for (const name of ["edge-base", "edge-glint"]) {
      const outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      outline.setAttribute("points", points);
      outline.setAttribute("pathLength", "100");
      outline.setAttribute("class", name);
      svg.append(outline);
    }
    item.append(svg);
  });
  const shop = $("#shop"), image = $("#background"), viewport = $("#viewport");
  const tooltip = $("#tooltip"), bookDialog = $("#book-dialog"), indexDialog = $("#index-dialog");
  const records = [
    ["Bilbo Baggins leaves his comfortable home to join a company of dwarves on a journey toward a dragon's mountain.", "An approachable adventure that gives courage, hospitality and an ordinary person's resourcefulness lasting weight.", "An English writer and philologist who created Middle-earth."],
    ["Winston Smith lives under a regime that seeks control over information, language and private thought.", "A lasting reference point for discussions of surveillance, propaganda and the fragility of truth.", "An English novelist and essayist whose work examines power and political language."],
    ["A fireman whose job is to burn books begins questioning a society organized around distraction and conformity.", "Its questions about reading, censorship and attention remain recognizable across changing media.", "An American writer whose work ranges across speculative fiction, fantasy and horror."],
    ["A managed future society trades personal freedom and difficult feelings for engineered stability.", "A counterpoint to overtly coercive dystopias: comfort itself can be a method of control.", "An English novelist and essayist interested in society, philosophy and consciousness."],
    ["Farm animals overthrow their owner, only to watch the ideals of their revolution change under new leadership.", "A compact political fable about hierarchy, manipulation and the corruption of collective ideals.", "An English novelist and essayist whose work examines power and political language."],
    ["Nick Carraway observes the wealth, longing and carefully constructed identity surrounding Jay Gatsby.", "Its portrait of aspiration and inequality complicates the promise of the American dream.", "An American novelist associated with the Jazz Age."],
    ["A child growing up in Alabama observes her father's defense of a Black man accused of a crime.", "A widely discussed novel about racial injustice, moral education and the limits of a child's perspective.", "An American novelist whose fiction draws on the social landscape of the American South."],
    ["Holden Caulfield wanders New York after leaving school, speaking with sharpness and uncertainty about the adult world.", "Its distinctive voice made adolescent alienation and emotional vulnerability central literary subjects.", "An American novelist and short-story writer known for closely observed, unsettled young characters."],
    ["Odysseus faces a long, interrupted journey home after the Trojan War while his household awaits his return.", "A foundational epic of homecoming, hospitality, storytelling and identity. Translation strongly shapes the reading experience.", "The ancient Greek poet traditionally credited with the Iliad and the Odyssey; the works emerge from an oral tradition."],
    ["A young man crosses into a magical land to retrieve a fallen star and discovers that his quest is not what he imagined.", "A fairy-tale adventure that plays with longing, transformation and the distance between a wish and its consequences.", "A British author whose fiction spans fantasy, comics and stories for different age groups."],
    ["Two magicians are bound into a competition whose arena is a mysterious traveling circus that opens at night.", "An atmospheric setting turns artistic rivalry into a story about creation, constraint and connection.", "An American novelist known for intricate, atmospheric fantasy settings."],
    ["Victor Frankenstein creates a living being, then abandons it, setting creator and creation on a destructive path.", "It asks what responsibility accompanies creation and what exclusion does to a person seeking companionship.", "An English novelist whose work helped establish a lasting conversation between Gothic fiction and science fiction."],
    ["Letters, diaries and reports trace an encounter with Count Dracula and an effort to understand and resist him.", "An influential Gothic novel whose anxieties about modernity, fear and invasion shaped later vampire fiction.", "An Irish author and theater manager best known for Dracula."],
    ["An orphan becomes a governess and must navigate love, independence and unsettling secrets at Thornfield Hall.", "Its insistence on the narrator's interior life and moral independence remains central to its appeal.", "An English novelist and poet, originally published under the name Currer Bell."],
    ["Two households on the Yorkshire moors are caught in a multigenerational cycle of longing, resentment and retaliation.", "A formally layered novel that resists treating destructive attachment as a simple love story.", "An English novelist and poet, originally published under the name Ellis Bell."],
    ["Paul Atreides arrives on the desert planet Arrakis as rival powers compete for control of a crucial resource.", "Its world links ecology, empire, religion and the dangers of charismatic leadership.", "An American science-fiction author whose fiction often explores ecology and systems of power."],
    ["A mathematician's plan seeks to reduce the chaos expected after the decline of a vast galactic empire.", "A landmark of large-scale speculative history, concerned with prediction, institutions and the limits of planning.", "An American science-fiction writer and prolific author of popular science."],
    ["Pilgrims travel toward the mysterious Shrike, each carrying a story that changes the meaning of their journey.", "Its linked narratives combine different literary modes within an ambitious science-fiction setting.", "An American author whose work ranges across science fiction, horror and historical fiction."],
    ["A washed-up hacker is recruited for a dangerous job involving powerful interests and artificial intelligence.", "Its language and networked imagination helped define cyberpunk's cultural vocabulary.", "An American-Canadian speculative-fiction author associated with cyberpunk."],
    ["An innkeeper recounts his younger life as a gifted performer and student drawn into dangerous mysteries.", "Its appeal lies in storytelling itself: reputation, memory and the gap between a life and its legend.", "An American fantasy novelist and author of The Kingkiller Chronicle."],
    ["Noble families compete for power in a realm where political instability and distant threats converge.", "An ensemble fantasy that emphasizes competing loyalties and the consequences of political choices.", "An American author and screenwriter, and creator of A Song of Ice and Fire."],
    ["A talented young wizard unleashes a shadow and must learn how to confront what he has brought into the world.", "Its coming-of-age story connects power with restraint, balance and self-knowledge.", "An American speculative-fiction author whose work examines society, language and alternative ways of living."],
    ["An angel and a demon find themselves reluctant to let the approaching apocalypse disrupt the world they have come to enjoy.", "Comic fantasy uses an unlikely partnership to question tidy divisions between good and evil.", "British fantasy writers whose collaboration combines mythic storytelling with satirical observation."],
    ["A boy discovers a forgotten book in postwar Barcelona and becomes entangled in the mystery of its author.", "A literary mystery that makes reading, memory and a city's hidden histories part of the same experience.", "A Spanish novelist known for atmospheric stories connected with Barcelona and the Cemetery of Forgotten Books."],
    ["A graduate student finds a book containing a scene from his own childhood and follows its clues toward a hidden world of stories.", "An immersive fantasy about storytelling, interpretation and the places readers imagine behind a page.", "An American novelist known for intricate, atmospheric fantasy settings."]
  ];
  let selected = 0, opener = null, localUrl = null, imageReady = false;
  let fullScene = false;
  $("#fit-scene").addEventListener("click", (event) => {
    fullScene = !fullScene;
    event.currentTarget.setAttribute("aria-pressed", String(fullScene));
    event.currentTarget.textContent = fullScene ? "Fill screen" : "Full scene";
    fit();
  });
  function fit() {
    if (!imageReady || !image.naturalWidth || !image.naturalHeight) return;
    const scale = (fullScene ? Math.min : Math.max)(viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
    shop.style.width = `${Math.max(0, image.naturalWidth * scale)}px`;
    shop.style.height = `${Math.max(0, image.naturalHeight * scale)}px`;
    hideTooltip();
  }
  image.addEventListener("load", () => { imageReady = true; shop.hidden = false; $("#image-error").hidden = true; fit(); });
  image.addEventListener("error", () => { imageReady = false; shop.hidden = true; $("#image-error").hidden = false; });
  new ResizeObserver(fit).observe(viewport);
  if (image.complete && image.naturalWidth) { imageReady = true; fit(); }
  function hideTooltip() { tooltip.hidden = true; }
  function positionTooltip(clientX, clientY) {
    const bounds = viewport.getBoundingClientRect();
    const x = clientX, y = clientY;
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(4, Math.min(x + 12, bounds.width - width - 4))}px`;
    tooltip.style.top = `${Math.max(4, Math.min(y - height - 12 < 4 ? y + 16 : y - height - 12, bounds.height - height - 4))}px`;
  }
  function showTooltip(link, x, y) {
    $("#tooltip-title").textContent = link.textContent;
    $("#tooltip-author").textContent = `by ${link.dataset.author}`;
    $("#status").textContent = `${link.textContent} · ${link.dataset.author}`;
    tooltip.hidden = false; positionTooltip(x, y);
  }
  links.forEach((link, index) => {
    link.dataset.number = String(index + 1);
    link.setAttribute("aria-label", `${index + 1}. ${link.textContent}, by ${link.dataset.author}`);
    link.addEventListener("pointerenter", (event) => showTooltip(link, event.clientX, event.clientY));
    link.addEventListener("pointermove", (event) => positionTooltip(event.clientX, event.clientY));
    link.addEventListener("pointerleave", () => { if (document.activeElement !== link) hideTooltip(); });
    link.addEventListener("focus", () => { const rect = link.getBoundingClientRect(); showTooltip(link, rect.left + rect.width / 2, rect.top); });
    link.addEventListener("blur", hideTooltip);
    link.addEventListener("keydown", (event) => { if (event.key === "Escape") hideTooltip(); });
    const li = document.createElement("li"), indexLink = document.createElement("a"), author = document.createElement("small");
    indexLink.href = link.hash; indexLink.textContent = link.textContent; author.textContent = link.dataset.author;
    indexLink.append(author); li.append(indexLink); $("#index-list").append(li);
  });
  $("#markers").addEventListener("click", (event) => { const active = document.body.classList.toggle("mapping"); event.currentTarget.setAttribute("aria-pressed", String(active)); event.currentTarget.textContent = active ? "Hide mapping" : "Show mapping"; });
  $("#open-index").addEventListener("click", () => { opener = document.activeElement; indexDialog.showModal(); });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => {
    const dialog = button.closest("dialog");
    if (dialog === bookDialog) returnToShelf(); else dialog.close();
  }));
  const pixelBook = $("#pixel-book");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let bookFlight = null, returning = false;
  // Original, intentionally low-resolution illustrations, not commercial covers.
  function paintCover(index) {
    const palettes = [
      ["#173f38", "#38705b", "#e7c778", "#0c2729"],
      ["#50242e", "#a6534b", "#f0c38a", "#291b2c"],
      ["#1f304e", "#516a85", "#e9d7a4", "#121d35"],
      ["#563922", "#ab793d", "#ffe0a1", "#30251f"],
      ["#35304f", "#776088", "#edcfb1", "#201f38"]
    ];
    const [ink, mid, paper, shadow] = palettes[index % palettes.length];
    const canvas = $("#cover-art"), ctx = canvas.getContext("2d");
    pixelBook.style.setProperty("--cover-ink", ink);
    pixelBook.style.setProperty("--cover-paper", paper);
    $("#cover-title").textContent = links[index].textContent;
    $("#cover-author").textContent = links[index].dataset.author;
    pixelBook.setAttribute("aria-label", `Original pixel-style placeholder cover for ${links[index].textContent}, by ${links[index].dataset.author}`);
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = ink; ctx.fillRect(0, 0, 96, 144);
    // Sparse cloth grain and inset, stepped foil border.
    ctx.fillStyle = mid;
    for (let y = 3; y < 144; y += 4) for (let x = 3; x < 96; x += 4) {
      if ((x * 7 + y * 3 + index) % 11 < 2) ctx.fillRect(x, y, 1, 1);
    }
    ctx.strokeStyle = paper; ctx.lineWidth = 1; ctx.strokeRect(9.5, 5.5, 80, 132);
    ctx.fillStyle = ink; ctx.fillRect(8, 4, 4, 4); ctx.fillRect(87, 4, 4, 4);
    // Moon, tiny stars and a stepped landscape on a 96 × 144 pixel grid.
    ctx.fillStyle = paper;
    ctx.fillRect(66, 63, 9, 13); ctx.fillRect(64, 66, 13, 7);
    ctx.fillStyle = ink; ctx.fillRect(63, 61, 9, 10);
    ctx.fillStyle = paper;
    for (let n = 0; n < 16; n++) {
      const x = 16 + ((n * 19 + index * 7) % 65), y = 60 + ((n * 13) % 37);
      ctx.fillRect(x, y, n % 5 === 0 ? 2 : 1, 1);
    }
    ctx.fillStyle = mid;
    for (let x = 12; x < 88; x += 3) {
      const peak = 91 - Math.max(0, 23 - Math.abs(x - 40)) + Math.floor(Math.abs(x - 40) / 6) * 2;
      ctx.fillRect(x, peak, 3, 116 - peak);
    }
    ctx.fillStyle = shadow;
    for (let x = 12; x < 88; x += 3) {
      const y = 100 + Math.floor(Math.sin(x * .12 + index) * 5);
      ctx.fillRect(x, y, 3, 119 - y);
    }
    ctx.fillStyle = paper;
    if (index % 3 === 0) { // A small door, for a journey into another world.
      ctx.fillRect(43, 93, 12, 21); ctx.fillRect(46, 90, 6, 3);
      ctx.fillStyle = ink; ctx.fillRect(46, 96, 6, 18);
    } else if (index % 3 === 1) { // An eye / distant sun.
      for (let n = 0; n < 5; n++) ctx.fillRect(35 + n * 3, 90 - Math.min(n, 4 - n) * 3, 3, 3);
      ctx.fillRect(41, 91, 3, 6);
    } else { // A tiny tower.
      ctx.fillRect(42, 87, 9, 24); ctx.fillRect(39, 84, 3, 6); ctx.fillRect(51, 84, 3, 6);
      ctx.fillStyle = ink; ctx.fillRect(45, 93, 3, 6);
    }
  }
  function shelfTransform() {
    const source = links[selected].getBoundingClientRect();
    const target = pixelBook.getBoundingClientRect();
    const visible = source.right > 0 && source.left < innerWidth && source.bottom > 0 && source.top < innerHeight;
    const x = visible ? source.left + source.width / 2 : innerWidth / 2;
    const y = visible ? source.top + source.height / 2 : innerHeight - 40;
    const scale = Math.max(.035, Math.min(.3, source.height / target.height));
    return `translate(${x - target.left - target.width / 2}px, ${y - target.top - target.height / 2}px) scale(${scale}) rotate(9deg) rotateY(48deg)`;
  }
  function liftBook() {
    bookFlight?.cancel(); returning = false;
    bookDialog.classList.remove("arriving");
    if (reducedMotion.matches) return;
    bookDialog.classList.add("arriving");
    bookFlight = pixelBook.animate([
      { transform: shelfTransform(), filter: "brightness(.55)", opacity: .55 },
      { transform: "translate(0,-12px) scale(1.045) rotate(-2deg)", filter: "brightness(1.15)", opacity: 1, offset: .8 },
      { transform: "none", filter: "brightness(1)", opacity: 1 }
    ], { duration: 950, easing: "cubic-bezier(.18,.7,.2,1)" });
  }
  function returnToShelf() {
    if (returning) return;
    bookFlight?.cancel();
    if (reducedMotion.matches) { bookDialog.close(); return; }
    returning = true;
    bookDialog.classList.remove("arriving");
    bookFlight = pixelBook.animate([
      { transform: "none", opacity: 1 },
      { transform: shelfTransform(), opacity: 0 }
    ], { duration: 450, easing: "cubic-bezier(.6,0,.8,.4)", fill: "forwards" });
    bookFlight.finished.then(() => bookDialog.close()).catch(() => {});
  }
  bookDialog.addEventListener("cancel", (event) => { event.preventDefault(); returnToShelf(); });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) { bookFlight?.cancel(); if (returning) bookDialog.close(); }
  });
  let switching = false;
  indexDialog.addEventListener("close", () => { if (!switching) opener?.focus({ preventScroll:true }); });
  function section(name) {
    $("#book-copy").textContent = records[selected][{ about:0, why:1, author:2 }[name]];
    document.querySelectorAll("[data-section]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.section === name)));
  }
  $(".tabs").addEventListener("click", (event) => { const button = event.target.closest("[data-section]"); if (button) section(button.dataset.section); });
  function route() {
    const index = links.findIndex((link) => link.hash === location.hash);
    if (!location.hash.startsWith("#book/")) { if (bookDialog.open) bookDialog.close(); return; }
    if (index < 0) { $("#status").textContent = "This book is not in the mapped collection."; return; }
    selected = index;
    const fromIndex = indexDialog.open;
    if (!bookDialog.open) opener = fromIndex ? links[index] : document.activeElement;
    if (fromIndex) { switching = true; indexDialog.close(); }
    hideTooltip();
    $("#record").textContent = `DISPLAY BOOK ${String(index + 1).padStart(2,"0")} / 25`;
    $("#book-title").textContent = links[index].textContent;
    $("#book-author").textContent = `by ${links[index].dataset.author}`;
    paintCover(index);
    $("#affiliate-note").hidden = true; $("#purchase").setAttribute("aria-expanded","false"); section("about");
    if (!bookDialog.open) bookDialog.showModal();
    bookDialog.scrollTop = 0;
    liftBook();
  }
  bookDialog.addEventListener("close", () => { bookFlight?.cancel(); returning = false; bookDialog.classList.remove("arriving"); if (location.hash.startsWith("#book/")) history.replaceState(null,"",`${location.pathname}${location.search}#home`); opener?.focus({ preventScroll:true }); switching = false; });
  $("#purchase").addEventListener("click", () => { const visible = $("#affiliate-note").hidden; $("#affiliate-note").hidden = !visible; $("#purchase").setAttribute("aria-expanded",String(visible)); });
  window.addEventListener("hashchange", route); route();
  $("#artwork").addEventListener("change", (event) => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 25 * 1024 * 1024) { $("#status").textContent = "Choose an image smaller than 25 MB."; return; }
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = URL.createObjectURL(file); image.src = localUrl;
    $("#status").textContent = "Local artwork selected. Use Show mapping to check the supplied coordinates.";
  });
})();
