/**
 * Measure every fixture: output size per method and how long our side takes to draw it.
 * Writes lib/stats.json, which the How it works page reads.
 *   npx tsx scripts/stats.ts
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { renderScene } from "../lib/scene/render";
import { sanitizeSvg } from "../lib/svg/sanitize";
import { compileTikz } from "../lib/tikz/compile";

const root = path.join(__dirname, "..");
const fx = path.join(root, "fixtures");

type Row = { id: string; method: "scene" | "tikz" | "svg"; chars: number; drawMs: number; ok: boolean };

async function main() {
  const rows: Row[] = [];
  for (const id of readdirSync(fx).filter((d) => existsSync(path.join(fx, d, "meta.json")))) {
    const scene = readFileSync(path.join(fx, id, "scene.json"), "utf8");
    // Count the description as Claude would write it: compact JSON, no pretty printing.
    const compact = JSON.stringify(JSON.parse(scene));
    let t = performance.now();
    const r = renderScene(JSON.parse(scene));
    rows.push({ id, method: "scene", chars: compact.length, drawMs: performance.now() - t, ok: r.ok });

    const tikz = readFileSync(path.join(fx, id, "tikz.tex"), "utf8");
    const c = await compileTikz(tikz);
    rows.push({ id, method: "tikz", chars: tikz.length, drawMs: c.ms, ok: c.ok });

    const svg = readFileSync(path.join(fx, id, "svg.svg"), "utf8");
    t = performance.now();
    const s = sanitizeSvg(svg);
    rows.push({ id, method: "svg", chars: svg.length, drawMs: performance.now() - t, ok: s.ok });
  }
  // What each method has to send Claude as instructions: the scene format, or the TikZ house helpers.
  const instructions = {
    scene: statSync(path.join(root, "lib/scene/schema.ts")).size,
    tikz: readFileSync(path.join(root, "lib/tikz/compile.ts"), "utf8").match(/TIKZ_PREAMBLE = String\.raw`([\s\S]*?)`/)?.[1].length ?? 0,
    svg: 0,
  };
  const out = { measuredAt: new Date().toISOString().slice(0, 10), instructions, rows };
  writeFileSync(path.join(root, "lib/stats.json"), JSON.stringify(out, null, 1));
  console.log(`wrote ${rows.length} rows`);
}

main().then(() => process.exit(0));
