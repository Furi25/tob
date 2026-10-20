/* Hard-coded design fixtures. Not a current chart or publisher cover reproduction. */
(() => {
  "use strict";
  const themes = {
    night: { bg: "#192726", surface: "#243632", ink: "#f3e5c7", muted: "#c6bea8", line: "#526158", accent: "#e6c288", dark: "#15201e", darkAccent: "#e6c288", buttonInk: "#192726", jacket: "#213432", jacketInk: "#ecd09b", stage: "#dedfd5", symbol: "✦" },
    rose: { bg: "#f5e8df", surface: "#ecd6cb", ink: "#542d38", muted: "#74525a", line: "#d2b4b0", accent: "#8e354d", dark: "#302026", darkAccent: "#f0b6c2", buttonInk: "#ffffff", jacket: "#a13d54", jacketInk: "#fff0d9", stage: "#f0ded8", symbol: "✳" },
    blue: { bg: "#e8edf1", surface: "#d3dfe7", ink: "#203d50", muted: "#4b6272", line: "#b5c7d1", accent: "#244f72", dark: "#182a36", darkAccent: "#a8d3ec", buttonInk: "#ffffff", jacket: "#284f6c", jacketInk: "#eff0df", stage: "#dce5e6", symbol: "◒" },
    ochre: { bg: "#f5efdf", surface: "#e9dfc4", ink: "#3c3426", muted: "#6f614d", line: "#d2c3a4", accent: "#754320", dark: "#2b251c", darkAccent: "#ebc783", buttonInk: "#ffffff", jacket: "#e0bb57", jacketInk: "#332c21", stage: "#eee5ce", symbol: "✺" },
    leaf: { bg: "#edf0e5", surface: "#dce2ce", ink: "#2d4133", muted: "#526653", line: "#bdc9b1", accent: "#355c40", dark: "#1c2b22", darkAccent: "#bdd5a2", buttonInk: "#ffffff", jacket: "#426449", jacketInk: "#f1e7bf", stage: "#dfe5d5", symbol: "❋" },
    scarlet: { bg: "#f5eae2", surface: "#e9d7ca", ink: "#4c2a25", muted: "#78574b", line: "#cfb5a5", accent: "#a13a2b", dark: "#30201c", darkAccent: "#f0af90", buttonInk: "#ffffff", jacket: "#ad3f29", jacketInk: "#ffe7ba", stage: "#eddfd1", symbol: "◈" }
  };
  // slug, theme, category, premise, editorial context, significance, author note
  const fixtures = [
    ["fourth-wing", "night", "Fantasy / Romance", "Violet Sorrengail expects a quiet life among books. Instead, she is sent into a brutal war college where dragon riders are made, alliances are fragile, and every bond comes at a cost.", "Its blend of high-stakes training, dragon lore, and romantic tension gives readers several reasons to turn the page. The Empyrean series has become a recognizable part of the romantasy conversation.", "Underneath the spectacle is a story about adapting rather than fitting in — and discovering that vulnerability and capability can coexist.", "Rebecca Yarros is an American novelist whose work spans contemporary romance and fantasy. Fourth Wing opens her Empyrean series."],
    ["onyx-storm", "night", "Fantasy / Romance", "The third Empyrean novel takes Violet beyond familiar boundaries as she seeks allies and answers in a conflict that keeps expanding.", "An established cast, unresolved questions, and a closely followed fantasy world make this a natural conversation point for series readers.", "It explores trust under pressure and what loyalty asks of people when the truth becomes difficult to hold.", "Rebecca Yarros writes contemporary romance and the dragon-rider fantasy series The Empyrean."],
    ["the-women", "leaf", "Historical fiction", "A young nurse serves in Vietnam, then returns to an America that struggles to acknowledge the women who were there.", "An intimate perspective on wartime service gives the novel a strong emotional center and a clear invitation to book-club discussion.", "It brings overlooked experiences into view and considers how a society remembers, or fails to remember, those who serve.", "Kristin Hannah is an American novelist known for historical fiction centered on women's lives, resilience, and relationships."],
    ["james", "ochre", "Literary fiction", "Percival Everett retells the journey associated with Huckleberry Finn from the perspective of the enslaved man Jim, giving him control of his own narrative.", "A familiar literary framework becomes a startlingly different reading experience when its center of gravity changes.", "Language, authorship, freedom, and the right to an interior life become the heart of the story.", "Percival Everett is an American novelist and professor whose work often examines identity, language, and the limits of familiar narratives."],
    ["the-god-of-the-woods", "leaf", "Literary mystery", "When a teenager disappears from a summer camp in the Adirondacks, the search exposes tensions between a wealthy family and the community around it.", "A layered mystery and an atmospheric setting make it appealing both as a suspense novel and as a character-driven family story.", "The novel uses disappearance to examine class, power, and whose stories are believed.", "Liz Moore is an American novelist whose fiction blends psychological insight with suspense and questions about community."],
    ["intermezzo", "blue", "Literary fiction", "After their father's death, two brothers navigate very different relationships while trying to understand one another and their own grief.", "Rooney's precise attention to private conversations and complicated attachment rewards readers who enjoy intimate, character-led fiction.", "It asks how love can make room for imperfection without becoming a demand that someone change.", "Sally Rooney is an Irish novelist known for her explorations of intimacy, class, and contemporary relationships."],
    ["the-let-them-theory", "ochre", "Personal growth", "Mel Robbins presents an approach to everyday relationships that separates other people's choices from the actions you can take yourself.", "A simple, memorable phrase makes the central idea easy to share and apply to familiar social frustrations.", "Its useful question is where personal agency begins. This is a self-help perspective, not a replacement for professional care.", "Mel Robbins is an American author and podcast host who discusses motivation, habits, and personal change."],
    ["atmosphere", "blue", "Historical romance", "A woman joins NASA's space shuttle program in the 1980s, discovering ambition, friendship, and love within an unusually demanding world.", "The combination of an expansive setting and intimate emotional stakes offers both escape and a reason to care deeply about the characters.", "It considers what it means to reach beyond the life others imagine for you.", "Taylor Jenkins Reid is an American novelist known for stories about ambition, public identity, and private relationships."],
    ["great-big-beautiful-life", "rose", "Romance", "Two writers compete to tell the life story of an enigmatic woman, only to find that the assignment complicates their assumptions about one another.", "A biographical puzzle gives a romantic rivalry another layer, with questions about which stories get told and by whom.", "The premise turns authorship into a conversation about empathy, interpretation, and the messiness of a whole life.", "Emily Henry is an American novelist whose contemporary romances often pair witty dialogue with questions about work, identity, and belonging."],
    ["sunrise-on-the-reaping", "scarlet", "Dystopian fiction", "This Hunger Games prequel returns to Panem during the fiftieth Games, following a young Haymitch Abernathy.", "A familiar character's earlier life adds another perspective to an established fictional world.", "The series' questions about spectacle, propaganda, and power take on a different shape when the outcome is already partly known.", "Suzanne Collins is an American author and the creator of The Hunger Games and The Underland Chronicles."],
    ["the-housemaid", "blue", "Psychological thriller", "A woman takes a live-in housekeeping job with a wealthy family and gradually discovers that the household's polished surface hides something troubling.", "A contained setting, shifting assumptions, and accessible pacing make it an easy invitation to read one chapter more.", "Its suspense grows out of unequal power and the danger of deciding too quickly who deserves trust.", "Freida McFadden is an American author known for psychological thrillers built around secrets and reversals."],
    ["iron-flame", "scarlet", "Fantasy / Romance", "Violet's second year of dragon-rider training brings harsher tests and new questions about the institutions she has been taught to trust.", "Readers invested in Fourth Wing return for the relationships, world-building, and consequences of its unresolved conflicts.", "The adventure explores the distance between institutional loyalty and individual conscience.", "Rebecca Yarros writes romance and fantasy. Iron Flame is the second novel in The Empyrean series."],
    ["the-anxious-generation", "blue", "Society / Psychology", "Jonathan Haidt argues that smartphone-centered childhood has contributed to changes in young people's mental health and proposes collective responses.", "It gives parents, educators, and policymakers a common starting point for a very immediate debate.", "Its claims invite scrutiny and discussion; the causes of youth mental-health trends remain an active, contested research area.", "Jonathan Haidt is a social psychologist and author whose work examines morality, social life, and cultural change."],
    ["atomic-habits", "ochre", "Personal growth", "James Clear explains a practical framework for making desired behaviors easier and unwanted behaviors harder through small changes to everyday systems.", "Concrete examples and repeatable techniques make the ideas approachable without requiring a complete reinvention of daily life.", "It shifts the focus from a dramatic burst of motivation to the environment and routines that shape repeated action.", "James Clear is an American author who writes about habits, decision-making, and incremental improvement."],
    ["the-thursday-murder-club", "leaf", "Mystery", "Four friends in a retirement community investigate an actual murder after spending their Thursdays discussing unsolved cases.", "Warmth, wit, and a satisfying investigative premise make this an inviting entry point to mystery fiction.", "It gives older characters agency, complexity, and full lives beyond the stereotypes often assigned to them.", "Richard Osman is a British author and broadcaster, and the creator of the Thursday Murder Club series."],
    ["tomorrow-and-tomorrow-and-tomorrow", "rose", "Literary fiction", "Two friends build video games together across decades, navigating creative ambition, complicated affection, and the consequences of working with someone who knows you deeply.", "The creative partnership offers a recognizable emotional story even for readers who have never played a video game.", "It treats making things together as a form of intimacy, with all its possibilities and misunderstandings.", "Gabrielle Zevin is an American novelist and screenwriter whose work often explores connection, memory, and storytelling."],
    ["yellowface", "ochre", "Literary satire", "A struggling writer takes a dead friend's manuscript and passes it off as her own, building a career that depends on keeping the theft hidden.", "A propulsive voice and a sharp publishing-world setting create a story that is both uncomfortable and difficult to put down.", "It examines appropriation, entitlement, and the stories people tell themselves to justify their own behavior.", "R. F. Kuang is a novelist whose work spans fantasy and literary fiction, often examining power, empire, and identity."],
    ["the-heaven-and-earth-grocery-store", "scarlet", "Historical fiction", "A mystery in a Pennsylvania town opens into the intertwined lives of Black and Jewish residents in a neighborhood called Chicken Hill.", "An expansive ensemble and an affectionate sense of community make its historical setting feel inhabited rather than distant.", "It considers how mutual care can flourish among people who are marginalized by the same structures in different ways.", "James McBride is an American author and musician whose work includes fiction, memoir, and cultural history."],
    ["remarkably-bright-creatures", "blue", "Contemporary fiction", "A widow working at an aquarium forms an unexpected connection with an octopus, while a young man's search for family brings their stories together.", "An unusual narrative perspective meets a warm, approachable story about loneliness and second chances.", "It suggests that attention and connection can arrive from the places people least expect.", "Shelby Van Pelt is an American novelist. Remarkably Bright Creatures is her debut novel."],
    ["the-covenant-of-water", "blue", "Historical fiction", "Across generations in Kerala, a family lives with a recurring pattern of drowning as medicine, love, and social change reshape their world.", "A sweeping timescale and a physician's attention to human vulnerability create an immersive family narrative.", "It links personal history with the changing ways people understand illness, inheritance, and care.", "Abraham Verghese is a physician and author whose writing frequently connects medical practice with human experience."],
    ["beautiful-ugly", "night", "Psychological thriller", "A writer retreats to an isolated Scottish island after his wife's disappearance, where unsettling encounters threaten his sense of what is real.", "An isolated setting and an unreliable sense of certainty give the story a strong atmosphere of unease.", "Its tension invites readers to question how grief, perception, and a need for answers shape a story.", "Alice Feeney is a British novelist known for psychological suspense and narratives built around uncertain perspectives."],
    ["the-wedding-people", "rose", "Contemporary fiction", "A woman arrives at a Rhode Island hotel just as an elaborate wedding takes over, becoming an unexpected confidante amid other people's carefully laid plans.", "Sharp social observation and unlikely connections create room for both humor and difficult feelings.", "It looks at the gap between the lives people perform and the support they actually need.", "Alison Espach is an American novelist whose work explores relationships, unexpected connection, and turning points in ordinary lives."],
    ["all-fours", "scarlet", "Literary fiction", "An artist sets out on a cross-country trip but stops close to home, beginning a period of experimentation that unsettles her relationships and self-image.", "Its unconventional voice and candid approach to midlife have made it a provocative subject for literary discussion.", "It challenges expectations about how a life should look and who gets permission to reinvent one.", "Miranda July is an American filmmaker, writer, and artist whose work moves between fiction, performance, and visual art."],
    ["the-creative-act", "ochre", "Creativity", "Rick Rubin offers short reflections on attention, experimentation, and the conditions that allow creative work to emerge.", "Its open-ended format invites readers to dip in, reflect, and connect the ideas with their own practice.", "It treats creativity as a relationship with the world rather than a skill reserved for professional artists.", "Rick Rubin is an American music producer whose work spans genres and generations of recording artists."],
    ["braiding-sweetgrass", "leaf", "Nature / Essays", "Robin Wall Kimmerer brings botanical science into conversation with Indigenous knowledge, reflecting on plants, reciprocity, and human relationships with the living world.", "An intimate essay form makes large ecological questions feel connected to everyday attention and responsibility.", "It asks readers to consider reciprocity, rather than extraction, as a way of understanding their place in nature.", "Robin Wall Kimmerer is a botanist, author, and enrolled member of the Citizen Potawatomi Nation." ]
  ];
  const home = document.getElementById("home-view");
  const detail = document.getElementById("detail-view");
  const grid = document.getElementById("book-grid");
  // Edition-specific preview identifiers, not an availability or licensing guarantee.
  const coverIsbns = [
    "9781649374042", "9781649374189", "9781250178633", "9780385550369", "9780593418918",
    "9780374602635", "9781401971366", "9780593158715", "9780593441299", "9781546171461",
    "9781538742570", "9781649374172", "9780593655030", "9780735211292", "9781984880963",
    "9780593321201", "9780063250833", "9780593422946", "9780063204157", "9780802162175",
    "9781250872008", "9781250899576", "9780593190265", "9780593652886", "9781571313560"
  ];
  let useRealCovers = false;
  let coversLoaded = 0;
  let coversFailed = 0;
  const coverStatus = document.getElementById("cover-status");
  function updateCoverStatus() {
    coverStatus.textContent = useRealCovers
      ? `Open Library previews · ${coversLoaded} loaded${coversFailed ? ` · ${coversFailed} unavailable` : ""} · Original designs fill any gaps · Not a live ranking`
      : "Illustrative selection · Original cover studies · Not a live ranking";
  }
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const books = fixtures.map((row, index) => {
    const link = grid.children[index].querySelector("a");
    return { slug: row[0], theme: themes[row[1]], category: row[2], about: row[3], popular: row[4], matters: row[5], bio: row[6], title: link.querySelector("h3").textContent, author: link.querySelector(".author").textContent, hook: link.querySelector(".hook").textContent, index };
  });
  function cover(book, extraClass = "") {
    const lengthClass = book.title.length > 30 ? "cover--long" : "";
    return `<span class="cover ${lengthClass} ${extraClass}" aria-hidden="true" style="--jacket:${book.theme.jacket};--jacket-ink:${book.theme.jacketInk}"><span class="cover-eyebrow">THE READING ROOM EDIT</span><span class="cover-title">${escape(book.title)}</span><span class="cover-symbol">${book.theme.symbol}</span><span class="cover-author">${escape(book.author)}</span></span>`;
  }
  function loadCoverPreviews(root) {
    root.querySelectorAll(".cover:not([data-preview-requested])").forEach((jacket) => {
      const index = jacket.closest("li") ? Array.from(grid.children).indexOf(jacket.closest("li")) : books.findIndex((book) => location.hash === `#book/${book.slug}`);
      if (index < 0) return;
      jacket.dataset.previewRequested = "true";
      const image = new Image();
      image.className = "real-cover-image";
      image.alt = ""; // The enclosing link or detail heading already names the book.
      image.referrerPolicy = "no-referrer";
      image.decoding = "async";
      image.onload = () => {
        if (image.naturalWidth < 10 || image.naturalHeight < 10) {
          if (root === grid) coversFailed++;
        } else {
          jacket.classList.add("has-real-cover");
          if (root === grid) coversLoaded++;
        }
        updateCoverStatus();
      };
      image.onerror = () => {
        if (root === grid) coversFailed++;
        image.remove();
        updateCoverStatus();
      };
      jacket.append(image);
      // default=false returns an error for a missing cover instead of a blank tile.
      image.src = `https://covers.openlibrary.org/b/isbn/${coverIsbns[index]}-L.jpg?default=false`;
    });
  }
  document.getElementById("real-covers").addEventListener("click", (event) => {
    useRealCovers = !useRealCovers;
    event.currentTarget.setAttribute("aria-pressed", String(useRealCovers));
    document.body.classList.toggle("show-real-covers", useRealCovers);
    if (useRealCovers) {
      loadCoverPreviews(grid);
      if (!detail.hidden) loadCoverPreviews(detail);
    }
    updateCoverStatus();
  });
  books.forEach((book) => {
    const stage = document.createElement("span");
    stage.className = "jacket-stage";
    stage.style.setProperty("--stage", book.theme.stage);
    stage.innerHTML = cover(book);
    const link = grid.children[book.index].querySelector("a");
    const info = document.createElement("span");
    info.className = "book-info";
    while (link.firstChild) info.append(link.firstChild);
    const spine = document.createElement("span");
    spine.className = "book-spine";
    spine.setAttribute("aria-hidden", "true");
    spine.style.setProperty("--jacket", book.theme.jacket);
    spine.style.setProperty("--jacket-ink", book.theme.jacketInk);
    spine.innerHTML = `<span>${escape(book.title)}</span><small>${escape(book.author)}</small>`;
    link.append(stage, spine, info);
  });
  document.body.dataset.layout = "shelf";
  document.querySelector(".view-picker").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-layout]");
    if (!button) return;
    document.body.dataset.layout = button.dataset.layout;
    document.querySelectorAll("[data-layout][aria-pressed]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
  });
  let previousBook = null;
  let homeScroll = 0;
  function renderRoute() {
    const hash = location.hash;
    if (!hash.startsWith("#book/")) {
      const returning = !detail.hidden;
      detail.hidden = true;
      home.hidden = false;
      document.body.classList.remove("is-detail");
      document.title = "The Reading Room — a discovery concept";
      if (returning && hash === "#collection" && previousBook) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: homeScroll, behavior: "instant" });
          grid.querySelector(`a[href="#book/${previousBook}"]`)?.focus({ preventScroll: true });
        });
      } else if (hash && hash !== "#home") {
        document.getElementById(hash.slice(1))?.scrollIntoView();
      } else if (returning || hash === "#home") window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    if (!home.hidden) homeScroll = window.scrollY;
    const slug = hash.slice(6);
    const book = books.find((item) => item.slug === slug);
    home.hidden = true;
    detail.hidden = false;
    if (!book) {
      document.body.classList.remove("is-detail");
      detail.innerHTML = '<div class="missing"><span class="eyebrow">A missing page</span><h1 id="detail-title" tabindex="-1">That book is not in this edit.</h1><a class="text-link" href="#collection">Back to all 25 books ↗</a></div>';
      document.title = "Book not found — The Reading Room";
    } else {
      previousBook = book.slug;
      const theme = book.theme;
      Object.entries({ bg: theme.bg, surface: theme.surface, ink: theme.ink, muted: theme.muted, line: theme.line, accent: theme.accent, dark: theme.dark, "dark-accent": theme.darkAccent, "button-ink": theme.buttonInk, halo: "#ffffff06" }).forEach(([key, value]) => document.body.style.setProperty(`--book-${key}`, value));
      document.body.classList.add("is-detail");
      const next = books[(book.index + 1) % books.length];
      detail.innerHTML = `
        <nav class="detail-nav" aria-label="Book navigation"><a href="#collection">← Back to the twenty-five</a><span>THE EDIT / ${String(book.index + 1).padStart(2, "0")} OF 25</span></nav>
        <div class="detail-hero"><div class="detail-art"><span class="art-caption">THE READING ROOM / COVER PREVIEW</span>${cover(book)}</div>
          <div class="detail-copy"><span class="eyebrow">${escape(book.category)}</span><h1 id="detail-title" tabindex="-1">${escape(book.title)}</h1><p class="detail-byline">By ${escape(book.author)}</p><p class="detail-deck">${escape(book.hook)}</p><a class="pill" href="#purchase-note" data-purchase>Find your copy <span aria-hidden="true">↗</span></a><p class="affiliate-note">In the finished site, this would be an affiliate link. This prototype does not open a retailer or track clicks.</p></div>
        </div>
        <div class="story-grid"><nav aria-label="On this book page"><ol class="story-index"><li><a href="#about" data-section="about"><span>01</span>The story</a></li><li><a href="#conversation" data-section="conversation"><span>02</span>The conversation</a></li><li><a href="#significance" data-section="significance"><span>03</span>The bigger picture</a></li></ol></nav>
          <div class="story-body"><section id="about"><h2>What's between the covers?</h2><p>${escape(book.about)}</p></section><section id="conversation"><h2>Why the conversation?</h2><p>${escape(book.popular)}</p></section><section id="significance"><h2>Why it stays with you.</h2><p>${escape(book.matters)}</p></section><section id="purchase-note" tabindex="-1"><h2>A note on buying books.</h2><p id="purchase-status">Retailer selection is still to be decided. A future purchase link may earn us a commission at no extra cost to you. No purchase link is active in this design study.</p></section></div>
          <aside class="author-box"><span class="eyebrow">The person behind the pages</span><h2>${escape(book.author)}</h2><p>${escape(book.bio)}</p><p>Editorial sample copy. Optional cover previews supplied by Open Library; artwork belongs to its respective rights holders. Original designs fill unavailable previews.</p></aside></div>
        <nav class="next-book" aria-label="Continue exploring"><a class="text-link" href="#collection">All twenty-five ↑</a><a href="#book/${next.slug}"><span class="eyebrow">Another world awaits</span><br>${escape(next.title)} ↗</a></nav>`;
      document.title = `${book.title} — The Reading Room`;
      if (useRealCovers) loadCoverPreviews(detail);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    detail.querySelector("h1")?.focus({ preventScroll: true });
  }
  // Keep in-page section links from replacing the hash-based book route.
  detail.addEventListener("click", (event) => {
    const link = event.target.closest("[data-section], [data-purchase]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = document.getElementById(link.dataset.section || "purchase-note");
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  });
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
})();