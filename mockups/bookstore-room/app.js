(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const links = [...document.querySelectorAll("#books a")];
  const palettes = [["#293f3d", "#ead1a5"], ["#642f3d", "#f0d4ac"], ["#3d5142", "#e7dbb3"], ["#b18b48", "#2a211d"], ["#324453", "#e5d9ba"], ["#874737", "#f3dab4"]];
  const descriptions = [
    "Violet enters a demanding dragon-rider college, where alliances are uncertain and every bond comes at a cost.",
    "Violet's journey continues beyond familiar borders as she searches for allies and answers in the expanding Empyrean world.",
    "A young nurse serves in Vietnam, then returns to a country struggling to recognize the women who were there.",
    "The river journey associated with Huckleberry Finn is retold from the perspective of the enslaved man Jim.",
    "A disappearance at an Adirondack summer camp exposes fractures between a wealthy family and its surrounding community.",
    "Two brothers navigate grief and very different romantic relationships after their father's death.",
    "A self-help framework separates other people's choices from the actions you can control. Not a substitute for professional care.",
    "A woman enters NASA's shuttle program in the 1980s, discovering ambition, friendship, and love.",
    "Two writers compete to tell an enigmatic woman's life story, while their own assumptions begin to shift.",
    "A Hunger Games prequel follows a young Haymitch Abernathy during the fiftieth Games.",
    "A live-in housekeeper discovers troubling secrets behind a wealthy family's polished facade.",
    "Violet's second year of dragon-rider training raises doubts about the institutions she has learned to trust.",
    "An argument about smartphone-centered childhood and youth mental health. The causal claims remain part of an active research debate.",
    "A practical framework for changing routines through small adjustments to behavior and environment.",
    "Four friends in a retirement community investigate a real murder after spending Thursdays discussing unsolved cases.",
    "Two friends make video games across decades of affection, ambition, and creative conflict.",
    "A writer steals a dead friend's manuscript and builds a career around claiming it as her own.",
    "A Pennsylvania mystery opens into the intertwined lives of Black and Jewish residents of Chicken Hill.",
    "A widow working in an aquarium forms an unlikely connection with an octopus as a young man's search for family unfolds.",
    "Generations of a Kerala family live with a recurring pattern of drowning amid changes in medicine and society.",
    "A writer retreats to a Scottish island after his wife's disappearance, where unsettling encounters challenge his sense of reality.",
    "A woman arrives at a Rhode Island hotel during a lavish wedding and becomes an unexpected confidante.",
    "An artist interrupts a cross-country trip and begins an experiment that unsettles her identity and relationships.",
    "Short reflections consider attention, experimentation, and the conditions in which creative work can emerge.",
    "Botanical science and Indigenous knowledge meet in essays on plants, reciprocity, and relationships with the living world."
  ];
  const contexts = [
    "Dragon lore meets romance and a high-stakes training story. Beneath the spectacle is a question about finding strength without denying vulnerability.",
    "Returning relationships and unresolved questions invite series readers deeper into a story about loyalty and difficult truths.",
    "An intimate perspective on wartime service invites discussion about whose experiences become part of a nation's memory.",
    "A familiar literary framework becomes a different experience when the center of narrative authority changes.",
    "A layered mystery offers suspense while asking how class and power shape whose accounts are believed.",
    "Close attention to difficult conversations makes grief and imperfect attachment feel immediate.",
    "A memorable idea makes personal agency approachable, while leaving room to question when acceptance is and is not useful.",
    "An expansive historical setting holds an intimate story about reaching beyond the life others imagine for you.",
    "A biographical puzzle adds another layer to romantic rivalry and questions about who gets to tell a life story.",
    "An earlier life opens another route into Panem's questions about spectacle, propaganda, and power.",
    "A contained setting and shifting assumptions make trust and unequal power central to its suspense.",
    "The continuation explores the tension between institutional loyalty and individual conscience.",
    "Its proposals give families and educators a shared starting point for debate; competing explanations deserve attention too.",
    "Concrete examples shift attention from bursts of motivation to systems that support repeated action.",
    "Warmth and wit make the mystery approachable while giving older characters agency and full lives.",
    "A creative partnership becomes an exploration of intimacy, ambition, and making things together.",
    "Publishing-world satire puts appropriation, entitlement, and self-justification under pressure.",
    "An expansive ensemble makes community and mutual care the heart of the story.",
    "An unusual perspective meets a warm story about loneliness, attention, and second chances.",
    "A sweeping family narrative connects inheritance and illness with the changing practice of care.",
    "Isolation and uncertain perception invite readers to question how grief shapes the answers people accept.",
    "Social observation creates room for humor and the gap between public performance and private need.",
    "An unconventional voice challenges expectations about midlife and who has permission to reinvent a life.",
    "An open-ended form treats creativity as a way of paying attention, rather than a professional category.",
    "Intimate observations connect ecological questions to reciprocity and everyday responsibility."
  ];
  const bios = {
    "Rebecca Yarros": "An American novelist working across contemporary romance and fantasy, including The Empyrean series.",
    "Kristin Hannah": "An American historical novelist known for centering women's lives and relationships.",
    "Percival Everett": "An American novelist and professor whose fiction examines identity, language, and narrative authority.",
    "Liz Moore": "An American novelist who combines psychological insight with suspense.",
    "Sally Rooney": "An Irish novelist exploring intimacy, class, and contemporary relationships.",
    "Mel Robbins": "An American author and podcast host discussing motivation and personal change.",
    "Taylor Jenkins Reid": "An American novelist writing about ambition, identity, and private relationships.",
    "Emily Henry": "An American romance novelist known for witty dialogue and questions of belonging.",
    "Suzanne Collins": "An American author and creator of The Hunger Games and The Underland Chronicles.",
    "Freida McFadden": "An American novelist known for psychological suspense and narrative reversals.",
    "Jonathan Haidt": "A social psychologist writing about morality, social life, and cultural change.",
    "James Clear": "An American author writing about habits and incremental improvement.",
    "Richard Osman": "A British author and broadcaster, and creator of the Thursday Murder Club series.",
    "Gabrielle Zevin": "An American novelist and screenwriter exploring connection and storytelling.",
    "R. F. Kuang": "A novelist whose fantasy and literary fiction examine power and identity.",
    "James McBride": "An American novelist, memoirist, and musician.",
    "Shelby Van Pelt": "An American novelist; Remarkably Bright Creatures is her debut novel.",
    "Abraham Verghese": "A physician and author connecting medical practice with human experience.",
    "Alice Feeney": "A British novelist known for psychological suspense.",
    "Alison Espach": "An American novelist exploring relationships and unexpected connection.",
    "Miranda July": "An American writer, filmmaker, and visual artist.",
    "Rick Rubin": "An American music producer whose work spans genres and generations.",
    "Robin Wall Kimmerer": "A botanist, author, and enrolled member of the Citizen Potawatomi Nation."
  };
  const detail = $("#detail");
  let selected = 0;
  let opener = null;
  links.forEach((link, index) => {
    const palette = palettes[index % palettes.length];
    link.style.setProperty("--jacket", palette[0]);
    link.style.setProperty("--jacket-ink", palette[1]);
    const preview = () => { $("#caption-title").textContent = link.textContent; $("#caption-note").textContent = `${link.dataset.author} · ${link.dataset.kind} · Open ↗`; };
    link.addEventListener("pointerenter", preview); link.addEventListener("focus", preview);
  });
  function showTab(name) {
    const link = links[selected];
    $("#detail-text").textContent = name === "about" ? descriptions[selected] : name === "context" ? contexts[selected] : `${link.dataset.author}. ${bios[link.dataset.author]}`;
    document.querySelectorAll("[data-tab]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.tab === name)));
  }
  document.querySelector(".detail-tabs").addEventListener("click", (event) => { const button = event.target.closest("[data-tab]"); if (button) showTab(button.dataset.tab); });
  function route() {
    if (!location.hash.startsWith("#book/")) { if (detail.open) detail.close(); return; }
    const index = links.findIndex((link) => link.hash === location.hash);
    if (index < 0) { $("#caption-title").textContent = "That book is not in this collection."; return; }
    selected = index;
    const link = links[index];
    if (!detail.open) opener = document.activeElement;
    $("#detail-title").textContent = link.textContent;
    $("#detail-author").textContent = `By ${link.dataset.author}`;
    $("#detail-kind").textContent = link.dataset.kind;
    $("#detail-hook").textContent = link.dataset.hook;
    $("#detail-number").textContent = `THE COLLECTION / ${String(index + 1).padStart(2, "0")} OF 25`;
    $("#detail-jacket").textContent = link.textContent;
    $("#detail-jacket").style.setProperty("--jacket", palettes[index % palettes.length][0]);
    $("#detail-jacket").style.setProperty("--jacket-ink", palettes[index % palettes.length][1]);
    $("#purchase").hidden = true;
    showTab("about");
    if (!detail.open) detail.showModal();
  }
  $("#close").addEventListener("click", () => detail.close());
  detail.addEventListener("close", () => { history.replaceState(null, "", `${location.pathname}${location.search}#home`); opener?.focus({ preventScroll: true }); });
  $("#buy").addEventListener("click", () => { $("#purchase").hidden = !$("#purchase").hidden; });
  window.addEventListener("hashchange", route); route();
  $("#toggle-books").addEventListener("click", (event) => {
    const off = document.body.classList.toggle("books-off");
    event.currentTarget.setAttribute("aria-pressed", String(!off)); event.currentTarget.textContent = off ? "Books off" : "Books on";
  });
  // Local file selection avoids a dependency on a file outside this standalone folder.
  let imageUrl = null;
  const image = $("#reference");
  function releaseImage() { if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = null; }
  $("#image-input").addEventListener("change", (event) => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 25 * 1024 * 1024) { $("#image-status").textContent = "Choose an image smaller than 25 MB."; return; }
    releaseImage(); imageUrl = URL.createObjectURL(file);
    image.onload = () => { image.hidden = false; document.body.classList.add("has-image"); $("#clear-image").hidden = false; $("#image-status").textContent = `${file.name} · Local preview only · Sample collection, not a live chart`; };
    image.onerror = () => { image.hidden = true; document.body.classList.remove("has-image"); $("#image-status").textContent = "This image could not be decoded. Try a JPEG or PNG export."; releaseImage(); };
    image.src = imageUrl;
  });
  $("#clear-image").addEventListener("click", () => { image.removeAttribute("src"); image.hidden = true; releaseImage(); document.body.classList.remove("has-image"); $("#clear-image").hidden = true; $("#image-input").value = ""; $("#image-status").textContent = "Load your bookstore reference to try it as the room backdrop. The image stays on this device."; });
  window.addEventListener("pagehide", releaseImage);
})();