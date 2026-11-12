/**
 * Tiny text markup for diagram labels:
 *   *x*      italic        **a**   bold (vectors)
 *   ^{2}     superscript   _{1}    subscript   (^2 / _1 for a single char)
 */

export type Run = { text: string; italic: boolean; bold: boolean; shift: -1 | 0 | 1 };

export function parseMarkup(src: string): Run[] {
  const runs: Run[] = [];
  let italic = false;
  let bold = false;
  let buf = "";
  const flush = (shift: -1 | 0 | 1 = 0) => {
    if (buf) runs.push({ text: buf, italic, bold, shift });
    buf = "";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "*" && src[i + 1] === "*") {
      flush();
      bold = !bold;
      i++;
      continue;
    }
    if (c === "*") {
      flush();
      italic = !italic;
      continue;
    }
    if ((c === "^" || c === "_") && i + 1 < src.length) {
      flush();
      const shift = c === "^" ? 1 : -1;
      let inner: string;
      if (src[i + 1] === "{") {
        const end = src.indexOf("}", i + 2);
        inner = end === -1 ? src.slice(i + 2) : src.slice(i + 2, end);
        i = end === -1 ? src.length : end;
      } else {
        inner = src[i + 1];
        i++;
      }
      buf = inner;
      flush(shift);
      continue;
    }
    buf += c;
  }
  flush();
  return runs;
}

const NARROW = new Set("il1.,:;'|!()[]fjtI ".split(""));
const WIDE = new Set("mwMW".split(""));

export function charWidth(ch: string, font: "serif" | "sans"): number {
  if (ch === " ") return 0.27;
  if (NARROW.has(ch)) return 0.3;
  if (WIDE.has(ch)) return font === "sans" ? 0.86 : 0.8;
  if (/[A-Z]/.test(ch)) return font === "sans" ? 0.68 : 0.66;
  if (/[0-9]/.test(ch)) return font === "sans" ? 0.58 : 0.5;
  if (ch === "°") return 0.4;
  return font === "sans" ? 0.56 : 0.48;
}

export function measure(src: string, size: number, font: "serif" | "sans"): { w: number; h: number } {
  const lines = src.split("\n");
  let w = 0;
  for (const line of lines) {
    let lw = 0;
    for (const r of parseMarkup(line)) {
      const s = r.shift ? size * 0.72 : size;
      for (const ch of r.text) lw += charWidth(ch, font) * s * (r.bold ? 1.08 : 1);
    }
    w = Math.max(w, lw);
  }
  return { w, h: size * 1.15 * lines.length };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Emit an SVG <text> centred at (cx, cy). */
export function textSvg(
  src: string,
  cx: number,
  cy: number,
  size: number,
  family: string,
  font: "serif" | "sans",
  opts: { weight?: string; rotate?: number; fill?: string; halo?: boolean } = {},
): string {
  const lines = src.split("\n");
  const lh = size * 1.15;
  const top = cy - ((lines.length - 1) * lh) / 2;
  const tr = opts.rotate ? ` transform="rotate(${-opts.rotate} ${f(cx)} ${f(cy)})"` : "";
  const halo = opts.halo
    ? ` paint-order="stroke" stroke="#fff" stroke-width="${f(size * 0.28)}" stroke-linejoin="round"`
    : "";
  let out = "";
  lines.forEach((line, li) => {
    const runs = parseMarkup(line);
    let spans = "";
    let cur = 0;
    for (const r of runs) {
      const dy = r.shift === 1 ? -size * 0.38 : r.shift === -1 ? size * 0.22 : 0;
      const delta = dy - cur;
      cur = dy;
      const attrs = [
        r.italic ? `font-style="italic"` : "",
        r.bold ? `font-weight="bold"` : "",
        r.shift ? `font-size="${f(size * 0.72)}"` : "",
        delta ? `dy="${f(delta)}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      spans += attrs ? `<tspan ${attrs}>${esc(r.text)}</tspan>` : esc(r.text);
    }
    void font;
    out += `<text x="${f(cx)}" y="${f(top + li * lh)}" font-size="${f(size)}" font-family="${family}" text-anchor="middle" dominant-baseline="central"${
      opts.weight ? ` font-weight="${opts.weight}"` : ""
    }${opts.fill ? ` fill="${opts.fill}"` : ""}${halo}${tr}>${spans}</text>`;
  });
  return out;
}

export function f(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}
