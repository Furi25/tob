/* Local art direction study. No requests, dependencies, chart claims or production assets. */
(() => {
  "use strict";
  const $ = (query) => document.querySelector(query);
  const links = [...document.querySelectorAll(".books a")];
  const chapters = [...document.querySelectorAll(".chapter")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let moving = !reduced.matches;
  let sound = false;
  let audio;
  let selected = 0;
  let hovered = null;
  let filter = "all";
  let frame = 0;
  const dialog = $("#book-dialog");
  let opener = null;
  let purchaseOpen = false;
  // Original sample editorial writing, in exactly the existing catalog order.
  // Premise / conversation / significance / author background.
  const editorial = [
    ["Violet Sorrengail enters a demanding dragon-rider college where physical danger and uncertain alliances shape every day.", "Dragon lore and romantic tension give the Empyrean series its distinctive pull.", "A story about finding capability without pretending vulnerability does not exist.", "An American novelist working across contemporary romance and fantasy."],
    ["Violet's journey continues beyond familiar borders as the search for allies and answers becomes more urgent.", "Returning characters and unresolved questions reward readers already invested in the Empyrean world.", "Trust becomes harder, and more necessary, when loyalty has consequences.", "The author of The Empyrean and several contemporary romance novels."],
    ["A young nurse serves in Vietnam and returns to a country reluctant to recognize the women who were there.", "An intimate perspective on wartime service offers an emotional center for book-club conversation.", "It asks whose experiences become part of a nation's memory.", "An American historical novelist known for centering women's lives and relationships."],
    ["The river journey associated with Huckleberry Finn is retold from the perspective of the enslaved man Jim.", "An established literary framework becomes unfamiliar when the person telling it changes.", "Language, freedom, and the right to tell one's own story take center stage.", "An American novelist and professor whose fiction often examines identity and language."],
    ["A teenager disappears from an Adirondack summer camp, exposing fractures between a wealthy family and the surrounding community.", "The mystery offers suspense alongside a layered portrait of family and place.", "Class and power shape whose accounts are trusted.", "An American novelist who combines psychological insight with suspense."],
    ["Two brothers navigate grief and different romantic relationships after their father's death.", "Close attention to difficult conversations gives an intimate story its emotional reach.", "It considers love as something more complicated than approval.", "An Irish novelist exploring intimacy, class, and contemporary relationships."],
    ["A self-help framework separates other people's choices from the actions you can control yourself.", "A memorable central phrase makes the idea easy to discuss and apply.", "Personal agency is useful to examine; self-help is not a substitute for professional care.", "An American author and podcast host discussing motivation and personal change."],
    ["A woman enters NASA's shuttle program in the 1980s, finding ambition, friendship, and love in a demanding environment.", "An expansive historical setting holds an intimate emotional story.", "It explores reaching beyond the life others imagine for you.", "An American novelist writing about ambition, identity, and private relationships."],
    ["Two writers compete to tell an enigmatic woman's life story, while their own assumptions begin to shift.", "A biographical puzzle gives a romantic rivalry another layer.", "It asks how much of a life any one storyteller can understand.", "An American romance novelist known for witty dialogue and questions of belonging."],
    ["A Hunger Games prequel follows young Haymitch Abernathy during the fiftieth Games.", "A familiar character's earlier life opens another route into Panem.", "Questions about spectacle, propaganda, and power return from a new perspective.", "An American author and the creator of The Hunger Games and The Underland Chronicles."],
    ["A live-in housekeeper discovers that a wealthy family's polished home hides troubling secrets.", "A contained setting and shifting assumptions create momentum.", "Unequal power can make the question of trust unusually dangerous.", "An American author known for psychological thrillers and narrative reversals."],
    ["Violet's second year of dragon-rider training raises new doubts about the institutions she has learned to trust.", "Readers return for the consequences of Fourth Wing's relationships and revelations.", "Institutional loyalty and individual conscience do not always agree.", "A romance and fantasy novelist; Iron Flame is the second Empyrean book."],
    ["Jonathan Haidt argues that smartphone-centered childhood has contributed to changes in youth mental health.", "Its proposals give families and schools a shared starting point for debate.", "The causes of youth mental-health trends remain a contested research area; the claims merit scrutiny.", "A social psychologist writing about morality, social life, and cultural change."],
    ["A framework for changing routines through small adjustments to behavior and environment.", "Concrete examples make the method approachable without demanding a complete reinvention.", "It shifts attention from motivation to the systems that support repeated action.", "An American author writing about habits and incremental improvement."],
    ["Four friends in a retirement community find themselves investigating a real murder.", "Warmth and wit make the investigative premise unusually welcoming.", "Older characters are given agency, complexity, and full lives.", "A British author and broadcaster who created the Thursday Murder Club series."],
    ["Two friends make video games together across decades of affection, ambition, and creative conflict.", "The partnership makes its emotional stakes accessible beyond gaming culture.", "Making things together can become its own complicated form of intimacy.", "An American novelist and screenwriter exploring connection and storytelling."],
    ["A writer steals a dead friend's manuscript and builds a career around claiming it as her own.", "A sharp publishing-world setting turns professional envy into propulsive satire.", "It examines appropriation, entitlement, and self-justifying narratives.", "A novelist whose fantasy and literary fiction examine power and identity."],
    ["A mystery in Pennsylvania opens into the intertwined lives of Black and Jewish residents of Chicken Hill.", "An expansive cast makes community itself an absorbing subject.", "Mutual care can resist the structures that marginalize people in different ways.", "An American novelist, memoirist, and musician."],
    ["A widow working in an aquarium forms an unlikely connection with an octopus as a young man's search for family unfolds.", "An unusual perspective meets an inviting story of second chances.", "Attention and companionship can arrive from unexpected places.", "An American novelist; this is her debut novel."],
    ["Generations of a family in Kerala live with a recurring pattern of drowning amid changes in medicine and society.", "A sweeping family story meets a physician's attention to human vulnerability.", "It connects inheritance and illness with the changing practice of care.", "A physician and author who connects medical practice with human experience."],
    ["A writer retreats to a Scottish island after his wife's disappearance and encounters unsettling uncertainties.", "Isolation and an unstable sense of reality create a sustained atmosphere of unease.", "Grief and perception can shape the answers people are willing to accept.", "A British novelist known for psychological suspense."],
    ["A woman arrives at a Rhode Island hotel during a lavish wedding and becomes an unexpected confidante.", "Social observation makes room for both humor and difficult feelings.", "The life people perform may differ from the support they need.", "An American novelist exploring relationships and unexpected connection."],
    ["An artist interrupts a cross-country trip near home and begins an experiment that unsettles her identity and relationships.", "An unconventional voice makes midlife reinvention a provocative topic for discussion.", "It challenges expectations about who gets permission to change a life.", "An American writer, filmmaker, and visual artist."],
    ["Short reflections consider attention, experimentation, and the conditions in which creativity can emerge.", "Its open-ended form invites readers to connect the observations with their own work.", "Creativity becomes a relationship with the world, not a professional category.", "An American music producer whose work spans genres and generations."],
    ["Botanical science and Indigenous knowledge meet in essays about plants, reciprocity, and the living world.", "Intimate observations connect ecological questions with everyday responsibility.", "Reciprocity offers an alternative to treating nature only as a resource.", "A botanist, author, and enrolled member of the Citizen Potawatomi Nation."]
  ];
  const books = links.map((link, index) => ({
    slug: link.hash.slice(6), title: link.querySelector(".book-title").textContent,
    author: link.querySelector(".author").textContent, hook: link.querySelector(".hook").textContent,
    kind: link.dataset.kind, motif: link.dataset.motif, index, copy: editorial[index]
  }));
  const escape = (text) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /* Original pixel art: intentionally drawn at low resolution, never a rasterized UI. */
  function painter(canvas) {
    const c = canvas.getContext("2d");
    c.imageSmoothingEnabled = false;
    const rect = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
    const poly = (points, color) => { c.fillStyle = color; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); };
    const glow = (x, y, r, color) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, "#b7652100"); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
    return { c, rect, poly, glow };
  }
  function study(canvas, t) {
    const { c, rect: r, poly, glow } = painter(canvas);
    r(0, 0, 480, 240, "#111018");
    // Angled room corner and parquet floor.
    poly([[26, 24], [300, 10], [300, 145], [26, 172]], "#35232a");
    poly([[300, 10], [458, 52], [458, 185], [300, 145]], "#281d25");
    poly([[26, 172], [300, 145], [458, 185], [210, 235]], "#53372d");
    for (let y = 29; y < 153; y += 12) {
      for (let x = 31 + (y % 24 ? 0 : 17); x < 294; x += 35) r(x, y, 31, 9, y % 3 ? "#422b2e" : "#39262d");
    }
    for (let y = 166; y < 231; y += 10) poly([[40, y], [300, y - 22], [445, y + 16], [440, y + 17], [300, y - 21], [42, y + 1]], "#77503a55");
    r(35, 159, 258, 5, "#211820");
    // Night window, stone framing, rain.
    r(175, 40, 91, 86, "#17151d"); r(180, 44, 81, 77, "#202c3a");
    r(187, 75, 12, 43, "#172330"); r(206, 64, 17, 54, "#162331"); r(238, 81, 16, 38, "#14202c");
    r(243, 51, 7, 7, "#989986"); r(245, 50, 4, 9, "#989986");
    for (let i = 0; i < 28; i++) { const x = 183 + (i * 17 % 75), y = 47 + ((i * 19 + t * 2) % 66); r(x, y, 1, 6, "#7c8d9c55"); }
    r(217, 44, 4, 78, "#594039"); r(180, 79, 82, 4, "#594039"); r(172, 122, 97, 6, "#795540");
    // Shelves and book spines.
    r(49, 42, 98, 112, "#21191f"); r(46, 39, 105, 7, "#72503a");
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 14; i++) { const h = 15 + i * 7 % 13, x = 54 + i * 6, y = 75 + row * 32 - h; const color = ["#7a3f43", "#aa784b", "#435548", "#354756", "#66504e"][i % 5]; r(x, y, 5, h, color); r(x + 1, y + 3, 3, 1, "#d9b17b55"); }
      r(48, 75 + row * 32, 102, 5, "#6b4934");
    }
    r(48, 46, 5, 108, "#65432e"); r(143, 46, 5, 108, "#483027");
    // Stone hearth and animated restrained embers.
    poly([[314, 70], [372, 84], [372, 154], [314, 140]], "#49332f");
    poly([[306, 66], [376, 82], [376, 90], [306, 74]], "#815c43");
    poly([[326, 99], [360, 107], [360, 144], [326, 137]], "#150f17");
    glow(342, 139, 62, "#d377344b");
    for (let i = 0; i < 6; i++) { const h = 8 + ((i * 7 + t) % 15); r(329 + i * 5, 138 - h, 4, h, i % 2 ? "#ce763b" : "#f0ae58"); r(330 + i * 5, 136 - h, 2, 4, "#edc178"); }
    poly([[308, 142], [373, 156], [383, 164], [310, 151]], "#78533e");
    // Rug, wine-colored armchair, cat and little book.
    poly([[159, 178], [254, 163], [315, 184], [215, 205]], "#713b3e");
    poly([[173, 180], [252, 169], [300, 184], [215, 199]], "#9a625033");
    poly([[177, 126], [207, 124], [224, 142], [225, 170], [193, 175], [171, 158]], "#572936");
    poly([[181, 128], [205, 129], [211, 153], [187, 157]], "#813f4b");
    poly([[177, 152], [210, 150], [220, 161], [190, 167]], "#a35e59"); r(172, 148, 9, 20, "#713947"); r(215, 145, 9, 23, "#6a3440");
    r(185, 173, 4, 8, "#20191d"); r(218, 169, 4, 8, "#20191d");
    r(244, 183, 19, 6, "#a87856"); r(248, 179, 11, 8, "#b6845c"); r(260, 180, 8, 6, "#ae7953"); r(261, 178, 3, 4, "#b8855a"); r(266, 178, 2, 3, "#b8855a"); r(263, 183, 3, 1, "#47302c");
    poly([[260, 164], [274, 167], [268, 175], [253, 171]], "#323c46");
    // Desk, glowing letter and green-shaded lamp.
    poly([[364, 151], [410, 141], [447, 154], [400, 166]], "#91643e");
    poly([[364, 155], [400, 167], [447, 156], [447, 161], [400, 173], [364, 160]], "#583c2e");
    r(371, 160, 4, 25, "#38282a"); r(435, 161, 4, 26, "#38282a");
    glow(402, 149, 44, "#dba85e66");
    poly([[387, 153], [401, 149], [412, 153], [398, 158]], "#e1c28b"); r(395, 152, 9, 1, "#a37b55");
    r(422, 127, 2, 19, "#b68d5b"); r(416, 145, 14, 3, "#a77b49");
    poly([[413, 119], [430, 119], [435, 129], [408, 129]], "#58745a"); r(410, 129, 23, 2, "#d9b574");
    glow(222, 161, 140, "#bd73331c");
    // Deterministic dithering gives a textured canvas, not random visual noise.
    for (let y = 20; y < 235; y += 4) for (let x = 26; x < 458; x += 4) if ((x * 3 + y * 7) % 17 < 3) r(x, y, 1, 1, "#d5a87918");
    c.globalAlpha = 1;
  }

  function vignette(canvas, motif, t, seed = 0) {
    const { rect: r, poly, glow } = painter(canvas);
    const w = canvas.width, h = canvas.height;
    r(0, 0, w, h, "#11121c");
    // Amber pool beneath a cool, arched window; each book changes the silhouette.
    glow(w * .51, h * .61, w * .65, "#ae64242e");
    r(w * .15, h * .13, w * .7, h * .61, "#302831");
    r(w * .18, h * .16, w * .64, h * .55, "#1c2c3b");
    for (let i = 0; i < 35; i++) r(w * .2 + ((i * 41 + seed * 7) % (w * .59)), h * .18 + ((i * 23) % (h * .45)), 1, 1, "#c7b7a566");
    if (["storm", "window", "door"].includes(motif)) for (let i = 0; i < 25; i++) r(w * .19 + (i * 19 % (w * .6)), h * .18 + ((i * 11 + t * 2) % (h * .45)), 1, 5, "#9aa7b770");
    if (["sea", "river"].includes(motif)) {
      r(w * .18, h * .43, w * .64, h * .28, "#2b4751");
      for (let i = 0; i < 18; i++) r(w * .2 + ((i * 23 + t) % (w * .5)), h * .45 + i * 3 % (h * .22), 9 + i % 7, 1, "#b2a77c60");
      poly([[w * .45, h * .48], [w * .66, h * .48], [w * .6, h * .54], [w * .5, h * .54]], "#171e29");
      r(w * .56, h * .32, 1, h * .16, "#d3b27e");
    } else if (["forest", "garden"].includes(motif)) {
      for (let i = 0; i < 7; i++) { const x = w * .2 + i * w * .09; r(x, h * .36, 3, h * .35, "#283f38"); poly([[x - 13, h * .63], [x + 1, h * .27], [x + 17, h * .63]], i % 2 ? "#395447" : "#253e39"); }
    } else if (["dragon", "fire"].includes(motif)) {
      poly([[w * .24, h * .45], [w * .36, h * .32], [w * .47, h * .48], [w * .53, h * .42], [w * .66, h * .27], [w * .77, h * .35], [w * .64, h * .36], [w * .59, h * .53], [w * .48, h * .59], [w * .39, h * .47]], "#101720");
      glow(w * .53, h * .58, w * .2, "#d78b3a55");
      r(w * .56, h * .48, 2, 2, "#f1bf72");
    } else if (motif === "door") {
      r(w * .4, h * .28, w * .22, h * .43, "#0b1019"); r(w * .58, h * .3, 2, h * .4, "#e6ac65"); glow(w * .59, h * .65, w * .25, "#d18b3b66");
    } else if (motif === "sun") {
      r(w * .38, h * .32, w * .24, h * .2, "#af674b"); r(w * .35, h * .37, w * .3, h * .1, "#c88554");
      for (let i = 0; i < 8; i++) r(w * .18, h * .44 + i * 4, w * .64, 2, "#352b36");
    } else if (motif === "stars") {
      r(w * .55, h * .27, 2, 20, "#d5c6a2"); r(w * .52, h * .32, 20, 2, "#d5c6a2");
      poly([[w * .33, h * .6], [w * .38, h * .45], [w * .43, h * .6]], "#b6aea1"); r(w * .37, h * .6, 4, 8, "#ce8c49");
    }
    r(w * .49, h * .16, 3, h * .55, "#70503c"); r(w * .18, h * .7, w * .64, 4, "#9a704c");
    r(0, h * .8, w, h * .2, "#332626");
    r(w * .15, h * .79, w * .7, 4, "#91623d");
    // Candle and a little pile of books anchor every scene in a reading space.
    const flame = moving ? t % 3 : 1;
    r(w * .74, h * .63, 5, h * .15, "#d3af78"); r(w * .75, h * .58 - flame, 2, 7, "#efc180"); glow(w * .75, h * .65, w * .23, "#edaa4e40");
    r(w * .23, h * .76, w * .19, 5, "#81505b"); r(w * .25, h * .73, w * .17, 5, "#a6875a");
    if (motif === "lamp") { r(w * .38, h * .51, 2, h * .23, "#aa895f"); poly([[w * .28, h * .48], [w * .47, h * .48], [w * .5, h * .55], [w * .25, h * .55]], "#6e8163"); glow(w * .38, h * .62, w * .26, "#cca15844"); }
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) if ((x + y * 3 + seed) % 13 < 3) r(x, y, 1, 1, "#c99b6a22");
  }

  function band(canvas, scene, t) {
    const { rect: r, poly, glow } = painter(canvas);
    r(0, 0, 480, 160, "#18141d");
    if (scene === "train") {
      r(0, 12, 480, 88, "#1c2a38");
      for (let i = 0; i < 70; i++) r((i * 37 + t) % 480, 18 + i * 13 % 65, 1, 7, "#78909b33");
      for (let x = 0; x < 480; x += 120) { r(x, 0, 8, 110, "#664432"); r(x + 7, 0, 2, 110, "#a6764b"); }
      r(0, 105, 480, 7, "#906843"); r(0, 122, 480, 31, "#5a303b"); r(0, 145, 480, 9, "#7d4347");
      for (let x = 45; x < 480; x += 120) { r(x, 5, 28, 2, "#dbb373"); glow(x + 12, 10, 65, "#da943b55"); }
    } else if (scene === "greenhouse") {
      r(0, 0, 480, 130, "#1b302e");
      for (let x = 0; x < 480; x += 55) { r(x, 0, 3, 130, "#697364"); poly([[x, 0], [x + 60, 60], [x + 60, 63], [x, 3]], "#536455"); }
      for (let i = 0; i < 35; i++) { const x = i * 37 % 480, y = i * 11 % 115; r(x, y, 2, 35, "#475d42"); r(x - 7, y + 5, 11, 4, "#52704b"); r(x + 1, y + 13, 12, 4, "#345540"); }
      r(0, 130, 480, 8, "#7e613f"); r(0, 138, 480, 22, "#211f20"); glow(260, 30, 140, "#c6973b2b");
    } else if (scene === "attic") {
      poly([[0, 0], [240, 64], [480, 0]], "#4c332d");
      for (let x = 0; x < 480; x += 80) poly([[x, 0], [x + 100, 80], [x + 105, 80], [x + 5, 0]], "#6c4a33");
      r(188, 36, 90, 62, "#453d3b"); r(195, 42, 75, 47, "#667d6a"); r(201, 49, 36, 2, "#ccd0a377"); r(201, 55, 48, 2, "#ccd0a355"); r(230, 98, 9, 13, "#5e5343"); r(0, 118, 480, 8, "#8c613d"); glow(232, 70, 125, "#8ca56f33");
    } else if (scene === "harbor") {
      r(0, 0, 480, 75, "#172634"); r(0, 75, 480, 60, "#253d48");
      for (let i = 0; i < 60; i++) r((i * 47 + t) % 480, 80 + i * 3 % 45, 10, 1, "#9e967344");
      r(355, 19, 9, 63, "#a09b86"); r(351, 17, 17, 5, "#dbbd7b"); glow(360, 20, 90, "#debb5a33");
      for (let x = 0; x < 480; x += 115) r(x, 0, 6, 138, "#5b4134"); r(0, 135, 480, 9, "#8f6540");
    } else {
      for (let y = 0; y < 160; y += 12) for (let x = (y % 24 ? 0 : 15); x < 480; x += 32) r(x, y, 29, 10, "#3c272b");
      r(180, 45, 115, 83, "#160e17"); r(172, 36, 130, 9, "#946b4b");
      for (let i = 0; i < 15; i++) r(190 + i * 6, 105 - (i * 7 + t) % 35, 5, 30, i % 2 ? "#b75b37" : "#db984d");
      glow(235, 100, 150, "#e98b343b"); r(160, 130, 154, 10, "#77533b");
    }
  }

  const canvases = [];
  books.forEach((book, index) => {
    const jacket = document.createElement("span"); jacket.className = "jacket"; jacket.setAttribute("aria-hidden", "true");
    const art = document.createElement("canvas"); art.width = 128; art.height = 180;
    jacket.append(art);
    const title = document.createElement("span"); title.className = "jacket-title"; title.innerHTML = `<small>THE MIDNIGHT EDIT</small>${escape(book.title)}`; jacket.append(title);
    links[index].prepend(jacket); canvases.push(art); vignette(art, book.motif, 0, index);
  });
  const studyArt = $("#study-art");
  const previewArt = $("#preview-art");
  study(studyArt, 0);
  document.querySelectorAll(".band-art").forEach((canvas) => band(canvas, canvas.dataset.scene, 0));

  function clickSound() {
    if (!sound) return;
    try {
      audio ||= new AudioContext();
      if (audio.state === "suspended") void audio.resume();
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = "triangle"; oscillator.frequency.setValueAtTime(190, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(75, audio.currentTime + .035);
      gain.gain.setValueAtTime(.025, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .045);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .05);
    } catch { sound = false; $("#sound").textContent = "Sound unavailable"; $("#sound").setAttribute("aria-pressed", "false"); }
  }
  function highlight(index) {
    const changed = selected !== index;
    selected = index;
    const book = books[index];
    links.forEach((link, i) => link.classList.toggle("is-selected", i === index));
    $("#preview-title").textContent = book.title;
    $("#preview-hook").textContent = book.hook;
    $("#preview-kind").textContent = book.kind === "reflection" ? "ESSAYS / WAYS OF SEEING" : book.kind === "shadow" ? "MYSTERY / THE DARKER CORNERS" : "FICTION / IMAGINED WORLDS";
    $("#record-number").textContent = String(index + 1).padStart(3, "0");
    $("#preview-link").href = `#book/${book.slug}`;
    previewArt.setAttribute("aria-label", `Symbolic pixel vignette for ${book.title}: ${book.motif}`);
    vignette(previewArt, book.motif, frame, index);
    if (changed && moving) {
      previewArt.getAnimations().forEach((animation) => animation.cancel());
      previewArt.animate([{ opacity: .25 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
    }
    if (changed && document.body.dataset.view === "archive") clickSound();
  }
  highlight(0);
  links.forEach((link, i) => {
    link.addEventListener("pointerenter", () => { hovered = i; highlight(i); });
    link.addEventListener("pointerleave", () => { if (hovered === i) hovered = null; });
    link.addEventListener("focus", () => { hovered = i; highlight(i); });
    link.addEventListener("blur", () => { if (hovered === i) hovered = null; });
  });
  function applyFilter(kind) {
    filter = kind;
    let total = 0;
    links.forEach((link, index) => { const show = kind === "all" || books[index].kind === kind; link.parentElement.hidden = !show; if (show) total++; });
    chapters.forEach((chapter) => { chapter.hidden = ![...chapter.querySelectorAll(".books > li")].some((li) => !li.hidden); });
    document.querySelectorAll("[data-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === kind)));
    $("#count").textContent = `${total} books waiting to be opened`;
    $("#collection-label").textContent = { all: "THE COMPLETE COLLECTION", fiction: "THE BOOKSHELF / IMAGINED WORLDS", reflection: "THE LETTER / WAYS OF SEEING", shadow: "THE JOURNAL / DARKER CORNERS" }[kind];
  }
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    applyFilter(filter === button.dataset.filter ? "all" : button.dataset.filter); clickSound();
    $("#catalog").focus({ preventScroll: true }); $(".catalog-bar").scrollIntoView({ behavior: moving ? "smooth" : "instant", block: "start" });
  }));
  $("#reset").addEventListener("click", () => applyFilter("all"));
  const descriptions = {
    study: "A quiet room. Twenty-five worlds. Touch something that catches your eye.",
    matrix: "Twenty-five books emerging from the candlelight. Linger over a cover; the rain keeps falling.",
    archive: "An index of possible worlds. Move through the records; leave the rest of the night outside.",
    journey: "Five places to pause. Five books in each. Follow the night at your own pace."
  };
  $(".mode-picker").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]"); if (!button) return;
    document.body.dataset.view = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    $("#view-description").textContent = descriptions[button.dataset.mode]; applyFilter("all"); clickSound();
  });
  $("#sound").addEventListener("click", () => { sound = !sound; $("#sound").textContent = sound ? "Sound on" : "Sound off"; $("#sound").setAttribute("aria-pressed", String(sound)); if (sound) clickSound(); });
  function syncMotion() {
    document.body.classList.toggle("motion-off", !moving);
    $("#motion").textContent = moving ? "Motion on" : "Motion off";
    $("#motion").setAttribute("aria-pressed", String(moving));
    if (!moving) document.querySelectorAll(".unseen").forEach((item) => item.classList.remove("unseen"));
  }
  $("#motion").addEventListener("click", () => { moving = !moving && !reduced.matches; syncMotion(); });
  reduced.addEventListener("change", () => { moving = !reduced.matches; syncMotion(); }); syncMotion();

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.remove("unseen"); observer.unobserve(entry.target); } }), { threshold: .08 });
    links.forEach((link) => { if (moving) link.parentElement.classList.add("unseen"); observer.observe(link.parentElement); });
  }

  function route() {
    if (!location.hash.startsWith("#book/")) { if (dialog.open) dialog.close(); return; }
    const book = books.find((item) => `#book/${item.slug}` === location.hash);
    const firstOpen = !dialog.open;
    if (firstOpen) opener = document.activeElement;
    purchaseOpen = false;
    if (!book) {
      $("#book-detail").innerHTML = '<h2 id="detail-title">This record is missing.</h2><p>Close this window to return to the archive.</p>';
    } else {
      $("#book-detail").innerHTML = `<div class="detail-layout"><div class="detail-art"><canvas width="256" height="300" aria-hidden="true" id="detail-art"></canvas></div><div class="detail-copy"><span class="eyebrow">RECORD ${String(book.index + 1).padStart(3, "0")} / MIDNIGHT ARCHIVE</span><h2 id="detail-title">${escape(book.title)}</h2><p>By ${escape(book.author)}</p><p><em>${escape(book.hook)}</em></p><h3>Between the covers</h3><p>${escape(book.copy[0])}</p><h3>Why the conversation?</h3><p>${escape(book.copy[1])}</p><h3>Why it matters</h3><p>${escape(book.copy[2])}</p><h3>The person behind the pages</h3><p><strong>${escape(book.author)}.</strong> ${escape(book.copy[3])}</p><button type="button" class="buy" id="buy" aria-expanded="false" aria-controls="purchase-note">Find a copy ↗</button><p class="purchase-note" id="purchase-note" hidden>No retailer is connected in this prototype. In the finished site, a clearly disclosed affiliate link may earn a commission at no extra cost to the reader.</p></div></div>`;
      vignette($("#detail-art"), book.motif, frame, book.index);
      $("#buy").addEventListener("click", () => { purchaseOpen = !purchaseOpen; $("#purchase-note").hidden = !purchaseOpen; $("#buy").setAttribute("aria-expanded", String(purchaseOpen)); });
    }
    if (firstOpen) dialog.showModal();
    $("#close-book").focus();
  }
  $("#close-book").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target !== dialog) return; const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); });
  dialog.addEventListener("close", () => { if (location.hash.startsWith("#book/")) history.replaceState(null, "", `${location.pathname}${location.search}#home`); opener?.focus({ preventScroll: true }); });
  window.addEventListener("hashchange", route); route();

  // Low frame rate is intentional. Only the visible room/preview and active card animate.
  window.setInterval(() => {
    if (!moving || document.hidden || dialog.open) return;
    frame++;
    const view = document.body.dataset.view;
    if (view === "study" && studyArt.getBoundingClientRect().bottom > 0) study(studyArt, frame);
    if (view === "archive") vignette(previewArt, books[selected].motif, frame, selected);
    if (hovered !== null && view !== "archive") vignette(canvases[hovered], books[hovered].motif, frame, hovered);
    if (view === "journey") document.querySelectorAll(".band-art").forEach((canvas) => { const rect = canvas.getBoundingClientRect(); if (rect.bottom > 0 && rect.top < innerHeight) band(canvas, canvas.dataset.scene, frame); });
  }, 160);
})();