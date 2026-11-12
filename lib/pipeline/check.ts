import { Resvg } from "@resvg/resvg-js";
import { readdirSync } from "node:fs";
import path from "node:path";
import type { Approach } from "../approaches";
import { renderSource } from "../outputs";

/**
 * Automatic checks run by our code on every attempt, for every model.
 * They catch problems a computer can see for sure: it does not draw, it draws
 * with warnings, or part of it falls outside the image.
 */

const fontDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "tikz-fonts", "bakoma", "ttf");
let fontFiles: string[] | null = null;

export function svgToPng(svg: string, width = 900): Buffer {
  fontFiles ??= readdirSync(fontDir).map((f) => path.join(fontDir, f));
  const r = new Resvg(svg, {
    background: "white",
    fitTo: { mode: "width", value: width },
    font: { fontFiles, loadSystemFonts: true, defaultFontFamily: "Helvetica" },
  });
  return Buffer.from(r.render().asPng());
}

/** Count dark pixels in a thin band around the edge of the image. */
function edgeInkFromSvg(svg: string): number {
  const r = new Resvg(svg, { background: "white", fitTo: { mode: "width", value: 600 }, font: { loadSystemFonts: true } });
  const img = r.render();
  const { width, height } = img;
  const px = img.pixels;
  const band = 2;
  let dark = 0;
  const isDark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return px[i] < 140 && px[i + 1] < 140 && px[i + 2] < 140;
  };
  for (let x = 0; x < width; x++)
    for (let b = 0; b < band; b++) {
      if (isDark(x, b)) dark++;
      if (isDark(x, height - 1 - b)) dark++;
    }
  for (let y = 0; y < height; y++)
    for (let b = 0; b < band; b++) {
      if (isDark(b, y)) dark++;
      if (isDark(width - 1 - b, y)) dark++;
    }
  return dark;
}

export type StaticResult = { drew: boolean; svg: string; png: Buffer | null; issues: string[]; ms: number };

export async function staticCheck(method: Approach, source: string, idPrefix = "a"): Promise<StaticResult> {
  const out = await renderSource(method, source, idPrefix);
  const issues: string[] = [];
  if (!out.ok || !out.svg) {
    const why = out.errors.join("\n").slice(0, 600) || "It did not produce a drawing.";
    return { drew: false, svg: "", png: null, issues: [`It did not draw. ${method === "tikz" ? "TeX error" : "Error"}: ${why}`], ms: out.ms };
  }
  // Warnings from our renderer, such as labels it could not place without overlapping.
  for (const w of out.warnings) if (!/compile cache/.test(w)) issues.push(w.charAt(0).toUpperCase() + w.slice(1) + ".");

  // Only hand written SVG chooses its own canvas, so only it can push things off the edge.
  if (method === "svg" && edgeInkFromSvg(out.svg) > 6) {
    issues.push("Part of the drawing touches the edge of the image, so something may be cut off.");
  }

  let png: Buffer | null = null;
  try {
    // TikZ output is cropped tight to the drawing; add a margin so the picture is not judged as cut off.
    const svg = method === "tikz" ? padSvg(out.svg, 12) : out.svg;
    png = svgToPng(svg);
  } catch (e) {
    issues.push(`The picture could not be rendered to an image: ${(e as Error).message}`);
  }
  return { drew: true, svg: out.svg, png, issues, ms: out.ms };
}

function padSvg(svg: string, pad: number): string {
  return svg.replace(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/, (_m, x, y, w, h) => {
    const nx = +x - pad,
      ny = +y - pad,
      nw = +w + 2 * pad,
      nh = +h + 2 * pad;
    return `viewBox="${nx} ${ny} ${nw} ${nh}"`;
  });
}
