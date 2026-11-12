import DOMPurify from "isomorphic-dompurify";

/**
 * Model-written SVG is untrusted: strip scripts, event handlers, foreignObject and external refs.
 */
export function sanitizeSvg(raw: string): { ok: true; svg: string; removed: number } | { ok: false; error: string } {
  const src = raw.trim();
  if (!src.startsWith("<svg")) return { ok: false, error: "output is not a single <svg> element" };
  const clean = DOMPurify.sanitize(src, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "image", "a"],
    FORBID_ATTR: ["href", "xlink:href"],
    ADD_ATTR: ["dominant-baseline", "paint-order"],
  });
  // Ignore DOMPurify's own <body> wrapper and stripped comments; count only real removals.
  const removed = (DOMPurify.removed ?? []).filter((r) => {
    const name = "element" in r ? (r.element as Node).nodeName : "";
    return name !== "BODY" && name !== "#comment";
  }).length;
  if (!clean.startsWith("<svg")) return { ok: false, error: "sanitiser rejected the SVG" };
  return { ok: true, svg: clean, removed };
}
