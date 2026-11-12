import type { Approach } from "./fixtures";
import { renderScene } from "./scene/render";
import { sanitizeSvg } from "./svg/sanitize";
import { compileTikz } from "./tikz/compile";

export type Output = {
  ok: boolean;
  svg: string;
  ms: number;
  warnings: string[];
  errors: string[];
};

export async function renderSource(kind: Approach, source: string, idPrefix = "s"): Promise<Output> {
  const t0 = performance.now();
  const done = (o: Omit<Output, "ms">): Output => ({ ...o, ms: Math.round(performance.now() - t0) });

  if (kind === "scene") {
    let json: unknown;
    try {
      json = JSON.parse(source);
    } catch (e) {
      return done({ ok: false, svg: "", warnings: [], errors: [`invalid JSON: ${(e as Error).message}`] });
    }
    const r = renderScene(json, { idPrefix });
    return done({ ok: r.ok, svg: r.svg, warnings: r.warnings, errors: r.errors });
  }

  if (kind === "tikz") {
    const r = await compileTikz(source);
    if (!r.ok) return { ok: false, svg: "", ms: r.ms, warnings: [], errors: [r.error] };
    const s = sanitizeSvg(r.svg);
    if (!s.ok) return { ok: false, svg: "", ms: r.ms, warnings: [], errors: [s.error] };
    return { ok: true, svg: s.svg, ms: r.ms, warnings: r.cached ? ["served from compile cache"] : [], errors: [] };
  }

  const s = sanitizeSvg(source);
  if (!s.ok) return done({ ok: false, svg: "", warnings: [], errors: [s.error] });
  return done({
    ok: true,
    svg: s.svg,
    warnings: s.removed ? [`sanitiser removed ${s.removed} unsafe node(s)`] : [],
    errors: [],
  });
}
