/**
 * Render fixtures to PNG for visual review (the "render then check" loop).
 *   npx tsx scripts/render.ts <outDir> [fixtureId ...]
 */
import { Resvg } from "@resvg/resvg-js";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderScene } from "../lib/scene/render";
import { compileTikz } from "../lib/tikz/compile";
import { sanitizeSvg } from "../lib/svg/sanitize";

const out = process.argv[2];
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const root = path.join(__dirname, "..", "fixtures");
const fontDir = path.join(__dirname, "..", "public", "tikz-fonts", "bakoma", "ttf");
const fontFiles = readdirSync(fontDir).map((f) => path.join(fontDir, f));

function png(svg: string, file: string) {
  const r = new Resvg(svg, {
    background: "white",
    fitTo: { mode: "width", value: 900 },
    font: { fontFiles, loadSystemFonts: true, defaultFontFamily: "Times New Roman" },
  });
  writeFileSync(file, r.render().asPng());
}

async function main() {
  const ids = only.length ? only : readdirSync(root).filter((d) => existsSync(path.join(root, d, "meta.json")));
  for (const id of ids) {
    const dir = path.join(root, id);
    const sceneFile = path.join(dir, "scene.json");
    if (existsSync(sceneFile)) {
      const r = renderScene(JSON.parse(readFileSync(sceneFile, "utf8")), { idPrefix: id });
      console.log(`[${id}] scene: ${r.ok ? "ok" : "FAIL"} labels=${r.stats.labels} collisions=${r.stats.collisions}`);
      r.errors.forEach((e) => console.log("   error:", e));
      r.warnings.forEach((w) => console.log("   warn:", w));
      if (r.svg) png(r.svg, path.join(out, `${id}-scene.png`));
    }
    const tikzFile = path.join(dir, "tikz.tex");
    if (existsSync(tikzFile)) {
      const r = await compileTikz(readFileSync(tikzFile, "utf8"));
      console.log(`[${id}] tikz: ${r.ok ? `ok ${r.ms}ms` : "FAIL " + r.error}`);
      if (r.ok) png(r.svg, path.join(out, `${id}-tikz.png`));
    }
    const svgFile = path.join(dir, "svg.svg");
    if (existsSync(svgFile)) {
      const s = sanitizeSvg(readFileSync(svgFile, "utf8"));
      console.log(`[${id}] svg: ${s.ok ? `ok${s.removed ? ` (sanitiser removed ${s.removed} nodes)` : ""}` : "FAIL " + s.error}`);
      if (s.ok) png(s.svg, path.join(out, `${id}-svg.png`));
    }
  }
}

main().then(() => process.exit(0));
