import type { Approach } from "./approaches";

/**
 * Prompts shared by every model and every way of running them
 * (Gemini runner, Claude helper agents, and the bring your own key page).
 * Keep them identical across models so the comparison is fair.
 */

const COMMON = `You draw diagrams for Singapore O Level and A Level exam questions.
Draw the figure that goes with the question, the way it would appear in a printed exam paper: black on white, clean lines, clear labels.
Include every point, value, label and object the question refers to. Do not add the answer to any part the student must work out, unless the question says the figure already shows it.
Use a sans serif look for science figures. Captions such as "Fig. 2.1" go below the figure when the question mentions one.
Reply with only the code, inside one fenced code block. No explanation.`;

const SCENE_GUIDE = `Describe the figure as JSON for our renderer. You say what is in the figure; the renderer works out exact positions, draws it and places labels so they do not overlap.

Coordinates are maths style: x to the right, y up. Choose units so the figure is about 6 to 10 units wide.

Top level:
{ "unit": 48, "font": "serif" | "sans", "caption": "Fig. 1.1", "note": "optional line under the figure",
  "points": { "A": PointDef, ... }, "elements": [ Element, ... ] }

A point reference is either a point name like "A" or a literal [x, y].

PointDef uses exactly one of these, plus optional "label": "A", "labelDir": "auto" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw", "dot": true:
  {"at": [x, y]}
  {"graph": [x, y]}                      point in graph units, scaled by the axes sx and sy
  {"polar": {"center": ref, "r": 2, "deg": 30}}   degrees anticlockwise from the positive x axis
  {"mid": [ref, ref]}
  {"along": {"from": ref, "to": ref, "t": 0.25}}   from + t times (to - from); t can be above 1 for a produced line
  {"intersect": [[ref, ref], [ref, ref]]}  where two infinite lines cross
  {"offset": {"from": ref, "dx": 1, "dy": 0}}
  {"move": {"from": ref, "d": 5, "deg": 40, "bearing": false}}   bearing true means clockwise from north
  {"foot": {"from": ref, "line": [ref, ref]}}   foot of the perpendicular
  {"lineCircle": {"line": [ref, ref], "center": ref, "r": 2, "pick": 0}}
  {"tangentsMeet": {"center": ref, "a": ref, "b": ref}}   where the tangents at a and b meet

Stroke fields on most elements: "style": "solid" | "dashed" | "dotted", "weight": "thin" | "normal" | "thick" | "heavy", "grey": 0 to 1 (1 is black).
Fill: "none" | {"grey": 0.3} | {"pattern": "hatch" | "crosshatch" | "dots" | "grid" | "waves"}.
Text may use *italic*, **bold**, ^{superscript} and _{subscript}.

Elements (each has "type"):
  segment: from, to, arrow ("none" | "end" | "start" | "both" | "mid"), extend, extendBack, label {"text", "side": "left" | "right" | "auto", "pos": 0.5}, ticks (equal length marks), parallel (parallel arrow marks)
  polygon: points [refs], closed (default true), fill, round (corner radius)
  rect: at (bottom left corner), w, h, fill, round, rotate (degrees about the corner)
  circle: center, r, fill        ellipse: center, rx, ry, rotate, fill
  arc: center, r, from, to (degrees)
  curve: points, closed, fill, tension, monotone (true for graph shapes whose x always increases; never overshoots)
  angle: at, a, b, label, r, right (right angle mark), reflex, double. Draws the smaller angle between rays at to a and at to b.
  tangent: center, at, before, after   tangent line to a circle at a point on it
  axes: x {min, max, step, label, minor, numbers}, y {...}, grid "none" | "major" | "minor", mode "cross" | "box", sx, sy (scale graph units to page units)
  plot: fn (for example "x^2 - 2*x - 3"), domain [a, b]   uses the axes scaling
  polyline: points [[x, y], ...] in graph units
  arrow: from, to, kind ("force" | "pointer" | "dimension" | "flow"), label, labelAt ("tip" | "tail" | "mid")
  text: at, text, anchor (direction from the point, or "c"), size ("small" | "normal" | "large"), rotate, halo
  callout: target, text, dir, dist   a label with a leader line; placed automatically outside the figure
  surface: from, to, side ("left" | "right")   a fixed wall or ground with hatch marks
  spring: from, to, coils, width
  liquid: points, fill   a filled region with a surface line on top
  bubbles: at, w, h, count, r

Example, a triangle with an angle and a midpoint:
{"unit": 48, "points": {"A": {"at": [0, 0], "label": "A"}, "B": {"at": [6, 0], "label": "B"}, "C": {"polar": {"center": "A", "r": 4, "deg": 50}, "label": "C"}, "M": {"mid": ["B", "C"], "label": "M", "dot": true}},
 "elements": [{"type": "polygon", "points": ["A", "B", "C"]}, {"type": "angle", "at": "A", "a": "B", "b": "C", "label": "50°"}, {"type": "segment", "from": "A", "to": "M", "style": "dashed"}]}

Reply with the JSON in a \`\`\`json code block.`;

const TIKZ_GUIDE = `Write TikZ code for one tikzpicture. It is compiled by a TeX engine on our server.
Already loaded: tikz with the libraries arrows.meta, calc, angles, quotes, decorations.markings, decorations.pathmorphing, intersections, positioning, through, shapes.geometric; amsmath and amssymb. pgfplots loads automatically if you use an axis.
You may add \\usepackage{circuitikz}, \\usepackage{chemfig}, \\usepackage{tikz-cd} or \\usepackage{tikz-3dplot} at the top if needed. No other packages are available.
pattern= fills do not work here. Use these helpers instead:
  \\hatchregion{(x1,y1) rectangle (x2,y2)}   diagonal hatching inside any closed path
  \\dotregion{x1}{y1}{x2}{y2}                dotted fill for liquids
  \\surface{(x1,y1)}{(x2,y2)}{1}            a fixed wall or ground line with hatch marks; use -1 for the other side
For science figures add font=\\sffamily to the tikzpicture options.
Do not include \\documentclass or \\begin{document}. Reply with the code in a \`\`\`latex code block.`;

const SVG_GUIDE = `Write a single SVG file by hand. Work out every coordinate yourself.
Rules: start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="..." width="..." height="...">, put a white background rect first, and make sure the viewBox contains everything, including every label.
No scripts, no images, no links, no external fonts. Use font-family Helvetica, Arial, sans-serif for science and Times New Roman for maths labels.
Reply with the SVG in a \`\`\`svg code block.`;

export function systemPrompt(method: Approach): string {
  const guide = method === "scene" ? SCENE_GUIDE : method === "tikz" ? TIKZ_GUIDE : SVG_GUIDE;
  return `${COMMON}\n\n${guide}`;
}

export function questionPrompt(question: string, figure?: string): string {
  const brief = figure?.trim() ? `\n\nWhat the figure must show:\n${figure.trim()}` : "";
  return `Draw the figure for this question.\n\nQuestion:\n${question}${brief}`;
}

/** What the model is told when its attempt had problems. */
export function retryPrompt(issues: string[]): string {
  return `Your diagram has these problems:\n${issues.map((i) => `- ${i}`).join("\n")}\n\nThe picture it produced is attached. Fix the problems and reply with the complete corrected code in one code block.`;
}

/** The checklist the model uses to judge the rendered picture. Same for every model and method. */
export const CHECK_PROMPT = `You are checking a diagram drawn for an exam question. The question and the rendered picture are attached.

Check each of these:
1. Everything the question and the figure description call for is in the picture: every named point, line, object, value and label.
2. The picture agrees with the question and the figure description: angles, lengths, ratios, directions and positions do not contradict anything stated. It does not need to be exactly to scale unless the question depends on it.
3. Every label is readable and clearly attached to the right thing. No label overlaps another label, and none sits on a line in a way that makes it hard to read.
4. Nothing is cut off at the edges, and there are no stray, broken or misplaced lines or shapes.
5. It follows normal exam conventions for the subject, and it does not give away an answer the student is meant to work out.

Reply with only JSON: {"pass": true or false, "issues": ["short description of each problem"]}.
List only real problems a teacher would need fixed. Set pass to true only if there are none.`;

export function checkPrompt(question: string, figure?: string): string {
  const brief = figure?.trim() ? `\n\nWhat the figure must show:\n${figure.trim()}` : "";
  return `${CHECK_PROMPT}\n\nQuestion:\n${question}${brief}`;
}

/** Pull the code out of a model reply. */
export function extractCode(method: Approach, reply: string): string {
  const blocks = [...reply.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0];
  const t = reply.trim();
  if (method === "svg") {
    const s = t.indexOf("<svg");
    const e = t.lastIndexOf("</svg>");
    if (s >= 0 && e > s) return t.slice(s, e + 6);
  }
  if (method === "scene") {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return t.slice(s, e + 1);
  }
  return t;
}

/** Parse the model's verdict on its picture. Unreadable replies count as a failed check. */
export function parseVerdict(reply: string): { pass: boolean; issues: string[] } {
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) return { pass: false, issues: ["The checker's reply could not be read."] };
  try {
    const v = JSON.parse(m[0]);
    const issues = Array.isArray(v.issues) ? v.issues.map(String).filter((s: string) => s.trim()) : [];
    // A pass with problems listed is treated as a fail, so the rule is the same for every model.
    return { pass: v.pass === true && issues.length === 0, issues };
  } catch {
    return { pass: false, issues: ["The checker's reply could not be read."] };
  }
}
