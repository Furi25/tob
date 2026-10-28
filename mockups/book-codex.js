const root = document.documentElement;
document.getElementById("book").addEventListener("change", (e) => { root.dataset.book = e.target.value; seed(); });
document.getElementById("mode").addEventListener("click", () => {
  root.dataset.mode = root.dataset.mode === "dark" ? "light" : "dark";
});

// Pixel ambience on a low-res canvas scaled up. Dune = drifting sand, 1984 = static blips, circus = rising embers.
const cv = document.getElementById("px");
const ctx = cv.getContext("2d");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const SCALE = 4;
let w, h, parts = [];

function size() { w = cv.width = Math.ceil(innerWidth / SCALE); h = cv.height = Math.ceil(innerHeight / SCALE); seed(); }
function seed() {
  parts = Array.from({ length: 70 }, () => ({ x: Math.random() * w, y: Math.random() * h, s: .2 + Math.random() * .6, t: Math.random() * 100 }));
  draw();
}
function draw() {
  const accent = getComputedStyle(root).getPropertyValue("--accent").trim();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = accent;
  for (const p of parts) {
    if (!reduce.matches) {
      if (root.dataset.book === "dune") { p.x += p.s * 1.2; p.y += Math.sin((p.t += .02)) * .2; }
      else if (root.dataset.book === "circus") { p.y -= p.s; p.x += Math.sin((p.t += .03)) * .3; }
      else { p.t += 1; if (Math.floor(p.t) % 90 === 0) { p.x = Math.random() * w; p.y = Math.random() * h; } }
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;
    }
    ctx.fillRect(p.x | 0, p.y | 0, 1, 1);
  }
}
function loop() { draw(); if (!reduce.matches) requestAnimationFrame(loop); }
addEventListener("resize", size);
reduce.addEventListener("change", () => { if (!reduce.matches) requestAnimationFrame(loop); });
size();
if (!reduce.matches) requestAnimationFrame(loop);
