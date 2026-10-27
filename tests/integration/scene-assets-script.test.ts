// Spec: docs/specs/multiple-bookshop-scenes.md — criterion #7 (npm run assets:scene -- <id>).
//
// Runs the real script and then checks the files it wrote. It rewrites files under public/bookshop/, which are
// committed build outputs; the script must be deterministic, so a clean run leaves `git diff` empty.
// Module path assumed as in scenes.test.ts.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENES, getScene } from "../../src/components/bookshop/scenes";
import { webpImage } from "../support/image-headers";

const root = process.cwd();
const RUN_TIMEOUT = 280_000;
// File systems round modification times; allow for it when deciding "written during this run".
const CLOCK_SLACK_MS = 2_000;

const servedFiles = (id: string) => {
  const scene = getScene(id);
  if (!scene) throw new Error(`scene ${id} is not registered`);
  const { version, widths, size } = scene.artwork;
  return widths.map((width) => ({
    width,
    height: Math.round((size.height * width) / size.width),
    file: path.join(root, "public", "bookshop", `${id}@${version}-${width}.webp`),
  }));
};

const mtimes = (id: string) => servedFiles(id).map(({ file }) => statSync(file).mtimeMs);

function run(args: string): void {
  execSync(`npm run assets:scene${args}`, { cwd: root, stdio: "pipe", timeout: RUN_TIMEOUT });
}

function expectValidFiles(id: string): void {
  for (const { width, height, file } of servedFiles(id)) {
    expect(existsSync(file), file).toBe(true);
    expect(webpImage(readFileSync(file)), `${id} ${width}px`).toEqual({ codec: "VP8L", width, height });
  }
}

describe("#7 npm run assets:scene", () => {
  it(
    "with an id, regenerates only that scene's three files, and they meet criterion 6",
    () => {
      const others = SCENES.filter((s) => s.id !== "abbey").map((s) => s.id);
      expect(others.length, "precondition: another scene exists").toBeGreaterThan(0);
      const before = Object.fromEntries(others.map((id) => [id, mtimes(id)]));
      const started = Date.now() - CLOCK_SLACK_MS;

      run(" -- abbey");

      expectValidFiles("abbey");
      for (const t of mtimes("abbey")) expect(t, "abbey file written during this run").toBeGreaterThanOrEqual(started);
      for (const id of others) expect(mtimes(id), `${id} files untouched`).toEqual(before[id]);
    },
    RUN_TIMEOUT + 10_000,
  );

  it(
    "with no id, regenerates every scene's files, and they meet criterion 6",
    () => {
      const started = Date.now() - CLOCK_SLACK_MS;

      run("");

      for (const { id } of SCENES) {
        expectValidFiles(id);
        for (const t of mtimes(id)) expect(t, `${id} file written during this run`).toBeGreaterThanOrEqual(started);
      }
    },
    RUN_TIMEOUT + 10_000,
  );
});
