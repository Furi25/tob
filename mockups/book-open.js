const root = document.documentElement;
document.getElementById("book").addEventListener("change", (e) => { root.dataset.book = e.target.value; });
document.getElementById("mode").addEventListener("click", () => {
  root.dataset.mode = root.dataset.mode === "dark" ? "light" : "dark";
});

// Pixel dust motes drifting through the shop's light. Static when reduced motion is on.
const cv = document.getElementById("px");
const ctx = cv.getContext("2d");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const SCALE = 3;
let w, h, motes = [];

function size() {
  w = cv.width = Math.ceil(innerWidth / SCALE);
  h = cv.height = Math.ceil(innerHeight / SCALE);
  motes = Array.from({ length: 60 }, () => ({ x: Math.random() * w, y: Math.random() * h, s: .1 + Math.random() * .3, t: Math.random() * 6, a: .3 + Math.random() * .6 }));
  draw();
}
function draw() {
  ctx.clearRect(0, 0, w, h);
  for (const m of motes) {
    if (!reduce.matches) {
      m.t += .02; m.x += Math.sin(m.t) * .15 + .08; m.y -= m.s * .5;
      if (m.y < 0) { m.y = h; m.x = Math.random() * w; }
      if (m.x > w) m.x = 0;
    }
    ctx.fillStyle = `rgba(255, 220, 150, ${m.a * (.6 + .4 * Math.sin(m.t * 2))})`;
    ctx.fillRect(m.x | 0, m.y | 0, 1, 1);
  }
}
function loop() { draw(); if (!reduce.matches) requestAnimationFrame(loop); }
addEventListener("resize", size);
reduce.addEventListener("change", () => { if (!reduce.matches) requestAnimationFrame(loop); else draw(); });
size();
if (!reduce.matches) requestAnimationFrame(loop);
