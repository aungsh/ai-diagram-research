import { compile } from "mathjs";
import { Scene, type ElementT, type FillT, type PointDefT, type PointRefT, type SceneT } from "./schema";
import { f, measure, textSvg } from "./text";

type V = [number, number];
type Box = { x: number; y: number; w: number; h: number };
type Seg = [V, V];

export type RenderResult = {
  ok: boolean;
  svg: string;
  warnings: string[];
  errors: string[];
  stats: { elements: number; labels: number; collisions: number };
};

const FAMILY = {
  serif: "'Times New Roman', 'STIX Two Text', Times, serif",
  sans: "'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif",
};
const SIZE = { small: 12.5, normal: 15, large: 18 };
const WEIGHT = { thin: 0.8, normal: 1.4, thick: 2.2, heavy: 4.5 };

// ---------- vector helpers ----------
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k];
const len = (a: V) => Math.hypot(a[0], a[1]);
const norm = (a: V): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
const perp = (a: V): V => [-a[1], a[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1];
const rad = (d: number) => (d * Math.PI) / 180;

function lineIntersect(p1: V, p2: V, p3: V, p4: V): V | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den;
  return add(p1, mul(d1, t));
}

function segIntersectsBox(s: Seg, b: Box): boolean {
  const [a, c] = s;
  const minX = b.x,
    maxX = b.x + b.w,
    minY = b.y,
    maxY = b.y + b.h;
  // Liang-Barsky clip
  let t0 = 0,
    t1 = 1;
  const dx = c[0] - a[0],
    dy = c[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - minX, maxX - a[0], a[1] - minY, maxY - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function segsCross(a: Seg, b: Seg): boolean {
  const o = (p: V, q: V, r: V) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a[0], a[1], b[0]) !== o(a[0], a[1], b[1]) && o(b[0], b[1], a[0]) !== o(b[0], b[1], a[1]);
}

function boxOverlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const DIRS: Record<string, V> = {
  n: [0, -1],
  ne: [0.7071, -0.7071],
  e: [1, 0],
  se: [0.7071, 0.7071],
  s: [0, 1],
  sw: [-0.7071, 0.7071],
  w: [-1, 0],
  nw: [-0.7071, -0.7071],
  c: [0, 0],
};

/** Box centred so that its edge sits `gap` px from anchor in direction d (screen coords). */
function boxAt(anchor: V, d: V, w: number, h: number, gap: number): Box {
  const cx = anchor[0] + d[0] * (gap + w / 2);
  const cy = anchor[1] + d[1] * (gap + h / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// ---------- renderer ----------
export function renderScene(input: unknown, opts: { idPrefix?: string } = {}): RenderResult {
  const parsed = Scene.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      svg: "",
      warnings: [],
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      stats: { elements: 0, labels: 0, collisions: 0 },
    };
  }
  return new Renderer(parsed.data, opts.idPrefix ?? "s").run();
}

type LabelReq = {
  text: string;
  size: number;
  /** Candidate boxes in priority order; the first has a small bonus. */
  candidates: Box[];
  /** Penalty added per candidate index (prefers earlier candidates). */
  orderCost?: number;
  leaderFrom?: V; // callout: draw a leader from target to box
  /** The point the label belongs to. Lines that start at this point are not counted as collisions near it. */
  anchor?: V;
  italic?: boolean;
  halo?: boolean;
  owner: string;
};

class Renderer {
  s: SceneT;
  U: number;
  pts = new Map<string, V>();
  resolving = new Set<string>();
  warnings: string[] = [];
  errors: string[] = [];
  body: string[] = [];
  top: string[] = []; // labels, drawn last
  defs = new Map<string, string>();
  obstacles: Seg[] = [];
  boxes: Box[] = [];
  /** Filled regions (patterns, grey) that labels should not sit on. */
  areas: V[][] = [];
  /** Bounding box of the drawing itself (before labels); callouts prefer to sit outside it. */
  contentBox: Box | null = null;
  leaders: Seg[] = [];
  extent: Box | null = null;
  labelCount = 0;
  collisions = 0;
  family: string;
  font: "serif" | "sans";
  prefix: string;

  constructor(s: SceneT, prefix: string) {
    this.s = s;
    this.U = s.unit;
    this.font = s.font;
    this.family = FAMILY[s.font];
    this.prefix = prefix;
  }

  // world -> screen px
  P = (w: V): V => [w[0] * this.U, -w[1] * this.U];

  grow(v: V) {
    if (!this.extent) this.extent = { x: v[0], y: v[1], w: 0, h: 0 };
    const e = this.extent;
    const x0 = Math.min(e.x, v[0]),
      y0 = Math.min(e.y, v[1]);
    const x1 = Math.max(e.x + e.w, v[0]),
      y1 = Math.max(e.y + e.h, v[1]);
    this.extent = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  growBox(b: Box) {
    this.grow([b.x, b.y]);
    this.grow([b.x + b.w, b.y + b.h]);
  }
  obstacle(a: V, b: V) {
    this.obstacles.push([a, b]);
    this.grow(a);
    this.grow(b);
  }
  obstaclePath(pts: V[], closed = false) {
    for (let i = 0; i < pts.length - 1; i++) this.obstacle(pts[i], pts[i + 1]);
    if (closed && pts.length > 2) this.obstacle(pts[pts.length - 1], pts[0]);
  }

  // ----- points -----
  ref(r: PointRefT, ctx = ""): V {
    if (Array.isArray(r)) return r as V;
    const got = this.pts.get(r);
    if (got) return got;
    const def = this.s.points[r];
    if (!def) {
      this.errors.push(`unknown point "${r}"${ctx ? ` in ${ctx}` : ""}`);
      return [0, 0];
    }
    if (this.resolving.has(r)) {
      this.errors.push(`circular point definition at "${r}"`);
      return [0, 0];
    }
    this.resolving.add(r);
    const v = this.resolvePoint(def, r);
    this.resolving.delete(r);
    this.pts.set(r, v);
    return v;
  }

  resolvePoint(d: PointDefT, id: string): V {
    const R = (x: PointRefT) => this.ref(x, `point ${id}`);
    if (d.at) return d.at as V;
    if (d.graph) {
      const ax = this.s.elements.find((e) => e.type === "axes") as Extract<ElementT, { type: "axes" }> | undefined;
      return [d.graph[0] * (ax?.sx ?? 1), d.graph[1] * (ax?.sy ?? 1)];
    }
    if (d.polar) {
      const c = R(d.polar.center);
      return [c[0] + d.polar.r * Math.cos(rad(d.polar.deg)), c[1] + d.polar.r * Math.sin(rad(d.polar.deg))];
    }
    if (d.mid) return mul(add(R(d.mid[0]), R(d.mid[1])), 0.5);
    if (d.along) {
      const a = R(d.along.from);
      return add(a, mul(sub(R(d.along.to), a), d.along.t));
    }
    if (d.intersect) {
      const v = lineIntersect(R(d.intersect[0][0]), R(d.intersect[0][1]), R(d.intersect[1][0]), R(d.intersect[1][1]));
      if (!v) {
        this.errors.push(`point "${id}": lines are parallel`);
        return [0, 0];
      }
      return v;
    }
    if (d.offset) return add(R(d.offset.from), [d.offset.dx, d.offset.dy]);
    if (d.move) {
      const a = R(d.move.from);
      const deg = d.move.bearing ? 90 - d.move.deg : d.move.deg;
      return add(a, [d.move.d * Math.cos(rad(deg)), d.move.d * Math.sin(rad(deg))]);
    }
    if (d.foot) {
      const p = R(d.foot.from),
        a = R(d.foot.line[0]),
        b = R(d.foot.line[1]);
      const ab = sub(b, a);
      const t = dot(sub(p, a), ab) / dot(ab, ab);
      return add(a, mul(ab, t));
    }
    if (d.lineCircle) {
      const a = R(d.lineCircle.line[0]),
        b = R(d.lineCircle.line[1]),
        c = R(d.lineCircle.center);
      const dv = sub(b, a);
      const fv = sub(a, c);
      const A = dot(dv, dv),
        B = 2 * dot(fv, dv),
        C = dot(fv, fv) - d.lineCircle.r ** 2;
      const disc = B * B - 4 * A * C;
      if (disc < 0) {
        this.errors.push(`point "${id}": line misses circle`);
        return a;
      }
      const ts = [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)].sort((x, y) => x - y);
      return add(a, mul(dv, ts[d.lineCircle.pick]));
    }
    if (d.tangentsMeet) {
      const c = R(d.tangentsMeet.center),
        a = R(d.tangentsMeet.a),
        b = R(d.tangentsMeet.b);
      const v = lineIntersect(a, add(a, perp(sub(a, c))), b, add(b, perp(sub(b, c))));
      if (!v) {
        this.errors.push(`point "${id}": tangents are parallel`);
        return [0, 0];
      }
      return v;
    }
    return [0, 0];
  }

  // ----- style helpers -----
  stroke(e: { style?: string; weight?: keyof typeof WEIGHT; grey?: number }): string {
    const w = WEIGHT[e.weight ?? "normal"];
    const g = Math.round(255 * (1 - (e.grey ?? 1)));
    const col = `rgb(${g},${g},${g})`;
    const dash = e.style === "dashed" ? ` stroke-dasharray="${f(w * 4 + 3)} ${f(w * 3 + 2)}"` : e.style === "dotted" ? ` stroke-dasharray="${f(w)} ${f(w * 2.5)}" stroke-linecap="round"` : "";
    return `stroke="${col}" stroke-width="${w}"${dash}`;
  }

  fill(fl: FillT): string {
    if (fl === "none") return `fill="none"`;
    if ("pattern" in fl) {
      const id = `${this.prefix}-${fl.pattern}-${fl.grey ?? 0}`;
      if (!this.defs.has(id)) this.defs.set(id, patternDef(id, fl.pattern, fl.grey ?? 0));
      return `fill="url(#${id})"`;
    }
    const g = Math.round(255 * (1 - fl.grey));
    return `fill="rgb(${g},${g},${g})"`;
  }

  arrowHead(tip: V, dir: V, size: number, width: number, color = "#000"): string {
    const d = norm(dir);
    const p = perp(d);
    const base = sub(tip, mul(d, size));
    const a = add(base, mul(p, width));
    const b = sub(base, mul(p, width));
    const notch = sub(tip, mul(d, size * 0.78));
    return `<path d="M${f(tip[0])} ${f(tip[1])}L${f(a[0])} ${f(a[1])}L${f(notch[0])} ${f(notch[1])}L${f(b[0])} ${f(b[1])}Z" fill="${color}" stroke="none"/>`;
  }

  // ----- main -----
  run(): RenderResult {
    // Resolve every point up front so errors surface even if unused.
    for (const id of Object.keys(this.s.points)) this.ref(id);

    const labelQueue: { pri: number; req: () => LabelReq | null }[] = [];
    const axesEl = this.s.elements.find((e) => e.type === "axes") as Extract<ElementT, { type: "axes" }> | undefined;

    for (const [i, e] of this.s.elements.entries()) {
      try {
        this.drawElement(e, i, labelQueue, axesEl);
      } catch (err) {
        this.errors.push(`element ${i} (${e.type}): ${(err as Error).message}`);
      }
    }

    // Point dots + labels
    for (const [id, def] of Object.entries(this.s.points)) {
      const p = this.P(this.ref(id));
      if (def.dot) {
        this.body.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="2.6" fill="#000"/>`);
        this.boxes.push({ x: p[0] - 3, y: p[1] - 3, w: 6, h: 6 });
        this.grow(p);
      }
      if (def.label) {
        const label = def.label;
        const dirName = def.labelDir;
        labelQueue.push({
          pri: 2,
          req: () => this.pointLabelReq(id, p, label, dirName),
        });
      }
    }

    this.contentBox = this.extent ? { ...this.extent } : null;
    labelQueue.sort((a, b) => a.pri - b.pri);
    for (const q of labelQueue) {
      const r = q.req();
      if (r) this.placeLabel(r);
    }

    // caption / note
    const ext = this.extent ?? { x: 0, y: 0, w: 100, h: 100 };
    const pad = 14;
    let vx = ext.x - pad,
      vy = ext.y - pad,
      vw = ext.w + 2 * pad,
      vh = ext.h + 2 * pad;
    if (this.s.view) {
      const a = this.P([this.s.view.xmin, this.s.view.ymax]);
      const b = this.P([this.s.view.xmax, this.s.view.ymin]);
      vx = Math.min(vx, a[0]);
      vy = Math.min(vy, a[1]);
      vw = Math.max(vx + vw, b[0]) - vx;
      vh = Math.max(vy + vh, b[1]) - vy;
    }
    const extra: string[] = [];
    let yCursor = vy + vh;
    if (this.s.note) {
      extra.push(textSvg(`*${this.s.note}*`, vx + vw / 2, yCursor + 6, 12.5, this.family, this.font, { fill: "#333" }));
      yCursor += 22;
    }
    if (this.s.caption) {
      extra.push(textSvg(this.s.caption, vx + vw / 2, yCursor + 12, 15, FAMILY.sans, "sans", { weight: "bold" }));
      yCursor += 30;
    }
    vh = yCursor - vy;

    const defs = this.defs.size ? `<defs>${[...this.defs.values()].join("")}</defs>` : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}" width="${f(vw)}" height="${f(vh)}" font-family="${this.family}">${defs}<rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" fill="#fff"/><g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">${this.body.join("")}</g>${this.top.join("")}${extra.join("")}</svg>`;

    return {
      ok: this.errors.length === 0,
      svg,
      warnings: this.warnings,
      errors: this.errors,
      stats: { elements: this.s.elements.length, labels: this.labelCount, collisions: this.collisions },
    };
  }

  // ----- labels -----
  /** Find the widest empty angular gap around a point among obstacle segments touching it. */
  freeDirection(p: V): V | null {
    const angles: number[] = [];
    for (const [a, b] of this.obstacles) {
      if (len(sub(a, p)) < 1.5 && len(sub(b, p)) > 1.5) angles.push(Math.atan2(b[1] - a[1], b[0] - a[0]));
      else if (len(sub(b, p)) < 1.5 && len(sub(a, p)) > 1.5) angles.push(Math.atan2(a[1] - b[1], a[0] - b[0]));
      else {
        // segment passing through p
        const ab = sub(b, a);
        const t = dot(sub(p, a), ab) / dot(ab, ab);
        if (t > 0.02 && t < 0.98 && len(sub(add(a, mul(ab, t)), p)) < 1.5) {
          angles.push(Math.atan2(ab[1], ab[0]));
          angles.push(Math.atan2(-ab[1], -ab[0]));
        }
      }
    }
    if (!angles.length) return null;
    angles.sort((x, y) => x - y);
    let best = 0,
      bestMid = 0;
    for (let i = 0; i < angles.length; i++) {
      const a0 = angles[i];
      const a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
      if (a1 - a0 > best) {
        best = a1 - a0;
        bestMid = (a0 + a1) / 2;
      }
    }
    return [Math.cos(bestMid), Math.sin(bestMid)];
  }

  pointLabelReq(id: string, p: V, text: string, dirName: string): LabelReq {
    const size = SIZE.normal;
    const italic = this.font === "serif" && /^[A-Za-z][0-9'′]*$/.test(text);
    const shown = italic ? `*${text}*` : text;
    const { w, h } = measure(shown, size, this.font);
    if (dirName !== "auto") {
      return { text: shown, size, candidates: [boxAt(p, DIRS[dirName], w, h, 4)], owner: `point ${id}`, anchor: p };
    }
    const pref = this.freeDirection(p);
    const dirs = Object.values(DIRS).filter((d) => d[0] || d[1]);
    if (pref) {
      dirs.unshift(pref);
      dirs.sort((a, b) => dot(b, pref) - dot(a, pref));
    }
    const candidates: Box[] = [];
    for (const gap of [4, 9]) for (const d of dirs) candidates.push(boxAt(p, d, w, h, gap));
    return { text: shown, size, candidates, orderCost: 0.6, owner: `point ${id}`, anchor: p };
  }

  placeLabel(r: LabelReq) {
    let best = r.candidates[0];
    let bestScore = Infinity;
    let bestHits = 0;
    r.candidates.forEach((b, idx) => {
      const inflated = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
      // Lines may come close to a label; only lines that actually cross the label's own box count.
      let hits = 0;
      for (const s of this.obstacles) if (segIntersectsBox(r.anchor ? trimAtAnchor(s, r.anchor) : s, b)) hits++;
      // A point's own dot is not something its label collides with.
      let overlap = 0;
      for (const o of this.boxes) {
        if (r.anchor && Math.abs(o.x + o.w / 2 - r.anchor[0]) < 1 && Math.abs(o.y + o.h / 2 - r.anchor[1]) < 1) continue;
        overlap += boxOverlap(inflated, o) / (b.w * b.h);
      }
      // Leaders crossing drawing lines is normal in exam figures (mild cost);
      // leaders crossing other leaders or running through labels is not (heavy cost).
      let leaderCost = 0;
      if (r.leaderFrom) {
        const end = closestOnBox(r.leaderFrom, b);
        const leader: Seg = [r.leaderFrom, end];
        for (const s of this.obstacles) {
          if (len(sub(s[0], r.leaderFrom)) < 2 || len(sub(s[1], r.leaderFrom)) < 2) continue;
          if (segsCross(leader, s)) leaderCost += 1;
        }
        for (const l of this.leaders) if (segsCross(leader, l)) leaderCost += 12;
        for (const o of this.boxes) if (segIntersectsBox(leader, o)) leaderCost += 12;
      }
      let onFill = 0;
      const samples: V[] = [
        [b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h / 2],
      ];
      for (const poly of this.areas) for (const sp of samples) if (pointInPoly(sp, poly)) onFill++;
      // Exam convention: callout labels sit outside the figure, leader lines reach in.
      let inside = 0;
      const cb = this.contentBox;
      if (r.leaderFrom && cb) {
        const cx = b.x + b.w / 2,
          cy = b.y + b.h / 2;
        if (cx > cb.x + 6 && cx < cb.x + cb.w - 6 && cy > cb.y + 6 && cy < cb.y + cb.h - 6) inside = 1;
      }
      const score = hits * 10 + overlap * 40 + leaderCost + onFill * 3 + inside * 8 + idx * (r.orderCost ?? 0.3);
      if (score < bestScore) {
        bestScore = score;
        best = b;
        bestHits = hits + (overlap > 0.05 ? 1 : 0);
      }
    });
    if (bestHits > 0 && process.env.DEBUG_LABELS) {
      const inf = { x: best.x - 2, y: best.y - 2, w: best.w + 4, h: best.h + 4 };
      const segs = this.obstacles.filter((s) => segIntersectsBox(r.anchor ? trimAtAnchor(s, r.anchor) : s, best)).map((s) => s.map((v) => v.map(Math.round)));
      const bx = this.boxes.filter((o) => boxOverlap(inf, o) / (best.w * best.h) > 0.05).map((o) => [o.x, o.y, o.w, o.h].map(Math.round));
      console.error("LABEL", r.text, "box", [best.x, best.y, best.w, best.h].map(Math.round), "anchor", r.anchor?.map(Math.round), "segs", JSON.stringify(segs), "boxes", JSON.stringify(bx));
    }
    if (bestHits > 0) {
      this.collisions++;
      this.warnings.push(`label "${r.text.replace(/\*/g, "")}" (${r.owner}) could not avoid overlapping other content`);
    }
    this.labelCount++;
    this.boxes.push(best);
    this.growBox(best);
    const cx = best.x + best.w / 2,
      cy = best.y + best.h / 2;
    if (r.leaderFrom) {
      const end = closestOnBox(r.leaderFrom, best, 2);
      const start = r.leaderFrom;
      this.body.push(`<path d="M${f(start[0])} ${f(start[1])}L${f(end[0])} ${f(end[1])}" stroke="#000" stroke-width="0.9"/>`);
      this.obstacles.push([start, end]);
      this.leaders.push([start, end]);
    }
    this.top.push(textSvg(r.text, cx, cy, r.size, this.family, this.font, { halo: r.halo }));
  }

  // ----- elements -----
  drawElement(
    e: ElementT,
    i: number,
    labels: { pri: number; req: () => LabelReq | null }[],
    axes: Extract<ElementT, { type: "axes" }> | undefined,
  ) {
    const R = (r: PointRefT) => this.P(this.ref(r, `element ${i} (${e.type})`));
    switch (e.type) {
      case "segment": {
        let a = this.ref(e.from, `element ${i}`),
          b = this.ref(e.to, `element ${i}`);
        const d = norm(sub(b, a));
        if (e.extend) b = add(b, mul(d, e.extend));
        if (e.extendBack) a = sub(a, mul(d, e.extendBack));
        const A = this.P(a),
          B = this.P(b);
        const sd = norm(sub(B, A));
        const w = WEIGHT[e.weight];
        let a2 = A,
          b2 = B;
        if (e.arrow === "end" || e.arrow === "both") b2 = sub(B, mul(sd, 7));
        if (e.arrow === "start" || e.arrow === "both") a2 = add(A, mul(sd, 7));
        this.body.push(`<path d="M${f(a2[0])} ${f(a2[1])}L${f(b2[0])} ${f(b2[1])}" ${this.stroke(e)}/>`);
        if (e.arrow === "end" || e.arrow === "both") this.body.push(this.arrowHead(B, sd, 10 + w, 3.6 + w * 0.6));
        if (e.arrow === "start" || e.arrow === "both") this.body.push(this.arrowHead(A, mul(sd, -1), 10 + w, 3.6 + w * 0.6));
        if (e.arrow === "mid") {
          const m = mul(add(A, B), 0.5);
          this.body.push(this.arrowHead(add(m, mul(sd, 5)), sd, 10, 4));
        }
        const pv = perp(sd);
        if (e.ticks) {
          const m = mul(add(A, B), 0.5);
          for (let k = 0; k < e.ticks; k++) {
            const c = add(m, mul(sd, (k - (e.ticks - 1) / 2) * 4));
            const p1 = add(c, mul(pv, 5)),
              p2 = sub(c, mul(pv, 5));
            this.body.push(`<path d="M${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}" stroke-width="1.2"/>`);
          }
        }
        if (e.parallel) {
          const m = add(A, mul(sub(B, A), 0.5));
          for (let k = 0; k < e.parallel; k++) {
            const tip = add(m, mul(sd, k * 6 + 3));
            const l1 = add(sub(tip, mul(sd, 6)), mul(pv, 4)),
              l2 = sub(sub(tip, mul(sd, 6)), mul(pv, 4));
            this.body.push(`<path d="M${f(l1[0])} ${f(l1[1])}L${f(tip[0])} ${f(tip[1])}L${f(l2[0])} ${f(l2[1])}" stroke-width="1.2"/>`);
          }
        }
        this.obstacle(A, B);
        if (e.label) {
          const lab = e.label;
          labels.push({
            pri: 3,
            req: () => {
              const text = lab.text;
              const { w: tw, h: th } = measure(text, SIZE.normal, this.font);
              const at = add(A, mul(sub(B, A), lab.pos));
              // screen-left of direction A->B is perp(sd) with y down => use -perp for "left" in maths sense
              const left = mul(pv, 1);
              const right = mul(pv, -1);
              // In screen coords (y down) perp([dx,dy]) = [-dy,dx] points to the right of travel visually; flip.
              const sides = lab.side === "left" ? [right] : lab.side === "right" ? [left] : [right, left];
              const cands: Box[] = [];
              for (const s of sides) for (const g of [5, 10]) cands.push(boxAt(at, s, tw, th, g));
              for (const t of [-0.12, 0.12]) for (const s of sides) cands.push(boxAt(add(at, mul(sub(B, A), t)), s, tw, th, 6));
              return { text, size: SIZE.normal, candidates: cands, orderCost: 0.4, owner: `segment ${i}` };
            },
          });
        }
        break;
      }
      case "polygon":
      case "rect":
      case "liquid": {
        let pts: V[];
        let round = 0;
        let closed = true;
        let fillSpec: FillT = "none";
        let strokeAttr = "";
        if (e.type === "rect") {
          const o = this.ref(e.at);
          const c = Math.cos(rad(e.rotate)),
            s = Math.sin(rad(e.rotate));
          const rot = (v: V): V => add(o, [v[0] * c - v[1] * s, v[0] * s + v[1] * c]);
          pts = [rot([0, 0]), rot([e.w, 0]), rot([e.w, e.h]), rot([0, e.h])].map(this.P);
          round = e.round;
          fillSpec = e.fill;
          strokeAttr = this.stroke(e);
        } else if (e.type === "polygon") {
          pts = e.points.map(R);
          round = e.round;
          closed = e.closed;
          fillSpec = e.fill;
          strokeAttr = this.stroke(e);
        } else {
          pts = e.points.map(R);
          fillSpec = e.fill;
          strokeAttr = `stroke="none"`;
        }
        const d = roundedPath(pts, round * this.U, closed);
        if (closed && busyFill(fillSpec)) this.areas.push(pts);
        this.body.push(`<path d="${d}" ${this.fill(closed ? fillSpec : "none")} ${strokeAttr}/>`);
        if (e.type === "liquid") {
          // surface line along the top edge (highest y on screen = smallest)
          const ys = pts.map((p) => p[1]);
          const topY = Math.min(...ys);
          const topPts = pts.filter((p) => Math.abs(p[1] - topY) < 0.5);
          if (topPts.length >= 2) {
            const xs = topPts.map((p) => p[0]);
            this.body.push(`<path d="M${f(Math.min(...xs))} ${f(topY)}H${f(Math.max(...xs))}" stroke-width="1"/>`);
          }
          pts.forEach((p) => this.grow(p));
        } else {
          this.obstaclePath(pts, closed);
        }
        break;
      }
      case "circle":
      case "ellipse": {
        const c = R(e.center);
        const rx = (e.type === "circle" ? e.r : e.rx) * this.U;
        const ry = (e.type === "circle" ? e.r : e.ry) * this.U;
        const rot = e.type === "ellipse" ? e.rotate : 0;
        this.body.push(
          `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx)}" ry="${f(ry)}"${rot ? ` transform="rotate(${-rot} ${f(c[0])} ${f(c[1])})"` : ""} ${this.fill(e.fill)} ${this.stroke(e)}/>`,
        );
        const poly: V[] = [];
        for (let k = 0; k <= 72; k++) {
          const t = (k / 72) * 2 * Math.PI;
          const x = rx * Math.cos(t),
            y = ry * Math.sin(t);
          const cr = Math.cos(rad(-rot)),
            sr = Math.sin(rad(-rot));
          poly.push([c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]);
        }
        this.obstaclePath(poly);
        if (busyFill(e.fill)) this.areas.push(poly);
        break;
      }
      case "arc": {
        const c = this.ref(e.center);
        const n = Math.max(8, Math.ceil(Math.abs(e.to - e.from) / 4));
        const pts: V[] = [];
        for (let k = 0; k <= n; k++) {
          const t = rad(e.from + ((e.to - e.from) * k) / n);
          pts.push(this.P([c[0] + e.r * Math.cos(t), c[1] + e.r * Math.sin(t)]));
        }
        this.body.push(`<path d="${polyPath(pts)}" ${this.stroke(e)}/>`);
        this.obstaclePath(pts);
        break;
      }
      case "curve": {
        const pts = e.points.map(R);
        const segs = e.monotone && !e.closed ? monotoneCtrl(pts) : catmullCtrl(pts, e.closed, e.tension);
        const d = bezierPath(pts[0], segs, e.closed);
        this.body.push(`<path d="${d}" ${this.fill(e.closed ? e.fill : "none")} ${this.stroke(e)}/>`);
        const sampled = sampleBezier(segs, e.closed ? null : pts[pts.length - 1]);
        this.obstaclePath(sampled, e.closed);
        if (e.closed && busyFill(e.fill)) this.areas.push(sampled);
        break;
      }
      case "angle": {
        const V0 = R(e.at),
          A = R(e.a),
          B = R(e.b);
        const ua = norm(sub(A, V0)),
          ub = norm(sub(B, V0));
        const la = len(sub(A, V0)),
          lb = len(sub(B, V0));
        const r = e.r ? e.r * this.U : Math.max(13, Math.min(26, Math.min(la, lb) * 0.28));
        if (e.right) {
          const s = 11;
          const p1 = add(V0, mul(ua, s)),
            p2 = add(add(V0, mul(ua, s)), mul(ub, s)),
            p3 = add(V0, mul(ub, s));
          this.body.push(`<path d="M${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}L${f(p3[0])} ${f(p3[1])}" stroke-width="1"/>`);
        } else {
          const t0 = Math.atan2(ua[1], ua[0]);
          let dt = Math.atan2(ub[1], ub[0]) - t0;
          while (dt <= -Math.PI) dt += 2 * Math.PI;
          while (dt > Math.PI) dt -= 2 * Math.PI;
          if (e.reflex) dt = dt > 0 ? dt - 2 * Math.PI : dt + 2 * Math.PI;
          const arc = (rr: number) => {
            const pts: V[] = [];
            const n = 24;
            for (let k = 0; k <= n; k++) {
              const t = t0 + (dt * k) / n;
              pts.push(add(V0, [rr * Math.cos(t), rr * Math.sin(t)]));
            }
            return pts;
          };
          this.body.push(`<path d="${polyPath(arc(r))}" stroke-width="1"/>`);
          if (e.double) this.body.push(`<path d="${polyPath(arc(r + 3.5))}" stroke-width="1"/>`);
          if (e.label) {
            const text = e.label;
            const mid = t0 + dt / 2;
            const bis: V = [Math.cos(mid), Math.sin(mid)];
            labels.push({
              pri: 1,
              req: () => {
                const { w, h } = measure(text, SIZE.small + 1, this.font);
                // Narrow angles need the label further out.
                const half = Math.abs(dt) / 2;
                const need = Math.max(r + 4, (Math.max(w, h) / 2 + 2) / Math.max(Math.sin(half), 0.15));
                const cands: Box[] = [];
                for (const extra of [0, 6, 14, 24]) {
                  const dist = Math.max(r + 3 + Math.hypot(w, h) / 2, Math.min(need, r + 60)) + extra;
                  const c = add(V0, mul(bis, dist));
                  cands.push({ x: c[0] - w / 2, y: c[1] - h / 2, w, h });
                }
                return { text, size: SIZE.small + 1, candidates: cands, orderCost: 1.5, owner: `angle ${i}` };
              },
            });
          }
        }
        break;
      }
      case "tangent": {
        const c = this.ref(e.center),
          t = this.ref(e.at);
        const u = norm(perp(sub(t, c)));
        const a = this.P(sub(t, mul(u, e.before))),
          b = this.P(add(t, mul(u, e.after)));
        this.body.push(`<path d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}" ${this.stroke(e)}/>`);
        this.obstacle(a, b);
        break;
      }
      case "axes": {
        this.drawAxes(e);
        break;
      }
      case "plot": {
        let fn: (x: number) => number;
        try {
          const c = compile(e.fn);
          fn = (x: number) => Number(c.evaluate({ x, pi: Math.PI, e: Math.E }));
        } catch (err) {
          this.errors.push(`plot "${e.fn}": ${(err as Error).message}`);
          return;
        }
        const sx = axes?.sx ?? e.sx,
          sy = axes?.sy ?? e.sy;
        const ylo = axes ? axes.y.min : -Infinity,
          yhi = axes ? axes.y.max : Infinity;
        const runs: V[][] = [[]];
        for (let k = 0; k <= e.samples; k++) {
          const x = e.domain[0] + ((e.domain[1] - e.domain[0]) * k) / e.samples;
          const y = fn(x);
          if (!Number.isFinite(y) || y < ylo - 1e-9 || y > yhi + 1e-9) {
            if (runs[runs.length - 1].length) runs.push([]);
            continue;
          }
          runs[runs.length - 1].push(this.P([x * sx, y * sy]));
        }
        for (const run of runs) {
          if (run.length < 2) continue;
          this.body.push(`<path d="${polyPath(run)}" ${this.stroke(e)}/>`);
          this.obstaclePath(run);
        }
        break;
      }
      case "polyline": {
        const sx = axes?.sx ?? e.sx,
          sy = axes?.sy ?? e.sy;
        const pts = e.points.map((p) => this.P([p[0] * sx, p[1] * sy]));
        this.body.push(`<path d="${polyPath(pts)}" ${this.stroke(e)}/>`);
        this.obstaclePath(pts);
        break;
      }
      case "arrow": {
        const A = R(e.from),
          B = R(e.to);
        const d = norm(sub(B, A));
        const spec = {
          force: { w: 2.2, hs: 13, hw: 5.5 },
          pointer: { w: 1, hs: 9, hw: 3.5 },
          dimension: { w: 1, hs: 9, hw: 3.5 },
          flow: { w: 1.6, hs: 11, hw: 4.5 },
        }[e.kind];
        const a2 = e.kind === "dimension" ? add(A, mul(d, spec.hs * 0.7)) : A;
        const b2 = sub(B, mul(d, spec.hs * 0.7));
        this.body.push(`<path d="M${f(a2[0])} ${f(a2[1])}L${f(b2[0])} ${f(b2[1])}" stroke-width="${spec.w}"/>`);
        this.body.push(this.arrowHead(B, d, spec.hs, spec.hw));
        if (e.kind === "dimension") this.body.push(this.arrowHead(A, mul(d, -1), spec.hs, spec.hw));
        this.obstacle(A, B);
        if (e.label) {
          const text = e.label;
          const where = e.labelAt ?? (e.kind === "dimension" ? "mid" : e.kind === "pointer" ? "tail" : "tip");
          labels.push({
            pri: 4,
            req: () => {
              const { w, h } = measure(text, SIZE.normal, this.font);
              const cands: Box[] = [];
              const pv = perp(d);
              if (where === "mid") {
                const m = mul(add(A, B), 0.5);
                for (const s of [pv, mul(pv, -1)]) for (const g of [5, 12]) cands.push(boxAt(m, s, w, h, g));
              } else {
                const anchor = where === "tip" ? B : A;
                const out = where === "tip" ? d : mul(d, -1);
                const dirs: V[] = [out, norm(add(out, pv)), norm(sub(out, pv)), pv, mul(pv, -1)];
                for (const g of [4, 10]) for (const dd of dirs) cands.push(boxAt(anchor, dd, w, h, g));
              }
              return { text, size: SIZE.normal, candidates: cands, orderCost: 0.5, owner: `${e.kind} arrow ${i}` };
            },
          });
        }
        break;
      }
      case "text": {
        const p = R(e.at);
        const size = SIZE[e.size];
        const fam = e.font ? FAMILY[e.font] : this.family;
        const { w, h } = measure(e.text, size, e.font ?? this.font);
        const b = e.anchor === "c" ? { x: p[0] - w / 2, y: p[1] - h / 2, w, h } : boxAt(p, DIRS[e.anchor], w, h, 3);
        if (!e.rotate) {
          this.boxes.push(b);
          this.growBox(b);
        } else this.grow(p);
        this.top.push(textSvg(e.text, b.x + b.w / 2, b.y + b.h / 2, size, fam, e.font ?? this.font, { rotate: e.rotate, halo: e.halo }));
        break;
      }
      case "callout": {
        const T = R(e.target);
        const text = e.text;
        if (e.at) {
          const at = R(e.at);
          labels.push({
            pri: 5,
            req: () => {
              const { w, h } = measure(text, SIZE.normal, this.font);
              return { text, size: SIZE.normal, candidates: [{ x: at[0] - w / 2, y: at[1] - h / 2, w, h }], leaderFrom: T, owner: `callout "${text}"` };
            },
          });
          break;
        }
        labels.push({
          pri: 5,
          req: () => {
            const { w, h } = measure(text, SIZE.normal, this.font);
            const base = (e.dist ?? 1.3) * this.U;
            const dirs: V[] = [];
            for (let k = 0; k < 16; k++) dirs.push([Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
            if (e.dir !== "auto") {
              const pd = DIRS[e.dir];
              dirs.sort((a, b) => dot(b, pd) - dot(a, pd));
            }
            const cands: Box[] = [];
            for (const m of [1, 1.5, 0.7, 2.1]) for (const d of dirs) cands.push(boxAt(T, d, w, h, base * m));
            return { text, size: SIZE.normal, candidates: cands, orderCost: e.dir !== "auto" ? 0.25 : 0.05, leaderFrom: T, owner: `callout "${text}"` };
          },
        });
        break;
      }
      case "surface": {
        const A = R(e.from),
          B = R(e.to);
        const d = norm(sub(B, A));
        const L = len(sub(B, A));
        // screen perp; "right" of travel in maths coords
        const side = e.side === "right" ? perp(d) : mul(perp(d), -1);
        let ticks = "";
        for (let s = 4; s < L - 2; s += 8) {
          const p = add(A, mul(d, s));
          const q = add(add(p, mul(side, 7)), mul(d, -5));
          ticks += `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;
        }
        this.body.push(`<path d="M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}" stroke-width="2.6"/>`);
        this.body.push(`<path d="${ticks}" stroke-width="0.9"/>`);
        this.obstacle(A, B);
        this.grow(add(A, mul(side, 8)));
        this.grow(add(B, mul(side, 8)));
        break;
      }
      case "spring": {
        const A = R(e.from),
          B = R(e.to);
        const d = norm(sub(B, A)),
          pv = perp(d);
        const L = len(sub(B, A));
        const lead = L * 0.1;
        const wpx = e.width * this.U;
        const pts: V[] = [A, add(A, mul(d, lead))];
        const n = e.coils * 2;
        for (let k = 0; k < n; k++) {
          const t = lead + ((L - 2 * lead) * (k + 0.5)) / n;
          pts.push(add(add(A, mul(d, t)), mul(pv, (k % 2 ? -1 : 1) * wpx)));
        }
        pts.push(sub(B, mul(d, lead)), B);
        this.body.push(`<path d="${polyPath(pts)}" stroke-width="1.3"/>`);
        this.obstaclePath(pts);
        break;
      }
      case "bubbles": {
        const o = this.ref(e.at);
        let seed = e.seed * 9301 + 49297;
        const rnd = () => {
          seed = (seed * 9301 + 49297) % 233280;
          return seed / 233280;
        };
        const placed: V[] = [];
        let tries = 0;
        while (placed.length < e.count && tries < 500) {
          tries++;
          const c: V = [o[0] + e.r + rnd() * (e.w - 2 * e.r), o[1] + e.r + rnd() * (e.h - 2 * e.r)];
          if (placed.every((p) => len(sub(p, c)) > e.r * 2.6)) placed.push(c);
        }
        for (const c of placed) {
          const p = this.P(c);
          this.body.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(e.r * this.U)}" fill="#fff" stroke-width="1"/>`);
        }
        this.grow(this.P(o));
        this.grow(this.P([o[0] + e.w, o[1] + e.h]));
        break;
      }
    }
  }

  drawAxes(e: Extract<ElementT, { type: "axes" }>) {
    const { x, y, sx, sy } = e;
    const X = (v: number) => v * sx * this.U;
    const Y = (v: number) => -v * sy * this.U;
    const x0 = X(x.min),
      x1 = X(x.max),
      y0 = Y(y.min),
      y1 = Y(y.max);
    const g: string[] = [];
    const ticksOf = (min: number, max: number, step: number) => {
      const out: number[] = [];
      const start = Math.ceil(min / step - 1e-9) * step;
      for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e9) / 1e9);
      return out;
    };
    if (e.grid !== "none") {
      if (e.grid === "minor") {
        const mx = x.minor || 5,
          my = y.minor || 5;
        let d = "";
        for (const v of ticksOf(x.min, x.max, x.step / mx)) d += `M${f(X(v))} ${f(y0)}V${f(y1)}`;
        for (const v of ticksOf(y.min, y.max, y.step / my)) d += `M${f(x0)} ${f(Y(v))}H${f(x1)}`;
        g.push(`<path d="${d}" stroke="#c8c8c8" stroke-width="0.5"/>`);
      }
      let d = "";
      for (const v of ticksOf(x.min, x.max, x.step)) d += `M${f(X(v))} ${f(y0)}V${f(y1)}`;
      for (const v of ticksOf(y.min, y.max, y.step)) d += `M${f(x0)} ${f(Y(v))}H${f(x1)}`;
      g.push(`<path d="${d}" stroke="#8a8a8a" stroke-width="0.8"/>`);
    }
    // axis lines
    const ax = e.mode === "box" ? y0 : Y(Math.min(Math.max(0, y.min), y.max));
    const ay = e.mode === "box" ? x0 : X(Math.min(Math.max(0, x.min), x.max));
    if (e.mode === "box") {
      g.push(`<path d="M${f(x0)} ${f(y1)}V${f(y0)}H${f(x1)}" stroke-width="1.3"/>`);
      if (y.min < 0 && y.max > 0) g.push(`<path d="M${f(x0)} ${f(Y(0))}H${f(x1)}" stroke-width="1.1"/>`);
    } else {
      g.push(`<path d="M${f(x0)} ${f(ax)}H${f(x1 + 10)}" stroke-width="1.3"/>`);
      g.push(this.arrowHead([x1 + 16, ax], [1, 0], 9, 3.5));
      g.push(`<path d="M${f(ay)} ${f(y0)}V${f(y1 - 10)}" stroke-width="1.3"/>`);
      g.push(this.arrowHead([ay, y1 - 16], [0, -1], 9, 3.5));
    }
    this.body.push(...g);
    this.obstacle([x0, ax], [x1, ax]);
    this.obstacle([ay, y0], [ay, y1]);
    this.grow([x0, y0]);
    this.grow([x1 + 16, y1 - 16]);
    const fmt = (v: number) => (Math.abs(v) < 1e-9 ? "0" : String(+v.toFixed(4)).replace("-", "−"));
    const size = SIZE.small;
    const fam = this.font === "serif" ? this.family : FAMILY.sans;
    const put = (text: string, cx: number, cy: number) => {
      const { w, h } = measure(text, size, this.font);
      const b = { x: cx - w / 2, y: cy - h / 2, w, h };
      this.boxes.push(b);
      this.growBox(b);
      this.top.push(textSvg(text, cx, cy, size, fam, this.font, { halo: true }));
    };
    if (x.numbers)
      for (const v of ticksOf(x.min, x.max, x.step)) {
        if (Math.abs(v) < 1e-9 && e.mode === "cross") continue;
        this.body.push(`<path d="M${f(X(v))} ${f(ax)}v4" stroke-width="1"/>`);
        put(fmt(v), X(v), ax + 13);
      }
    if (y.numbers)
      for (const v of ticksOf(y.min, y.max, y.step)) {
        if (Math.abs(v) < 1e-9 && e.mode === "cross") continue;
        this.body.push(`<path d="M${f(ay)} ${f(Y(v))}h-4" stroke-width="1"/>`);
        const t = fmt(v);
        const { w } = measure(t, size, this.font);
        put(t, ay - 8 - w / 2, Y(v));
      }
    if (e.mode === "cross" && e.originLabel && x.min <= 0 && y.min <= 0) put("0", ay - 9, ax + 12);
    if (x.label) {
      const { w, h } = measure(x.label, SIZE.normal, this.font);
      const b =
        e.mode === "cross"
          ? { x: x1 + 14 - w, y: ax - 12 - h, w, h }
          : { x: (x0 + x1) / 2 - w / 2, y: y0 + 24, w, h };
      this.boxes.push(b);
      this.growBox(b);
      this.top.push(textSvg(x.label, b.x + w / 2, b.y + h / 2, SIZE.normal, this.family, this.font));
    }
    if (y.label) {
      const { w, h } = measure(y.label, SIZE.normal, this.font);
      if (e.mode === "cross") {
        const b = { x: ay + 10, y: y1 - 18 - h / 2, w, h };
        this.boxes.push(b);
        this.growBox(b);
        this.top.push(textSvg(y.label, b.x + w / 2, b.y + h / 2, SIZE.normal, this.family, this.font));
      } else {
        const cx = x0 - 46,
          cy = (y0 + y1) / 2;
        this.grow([cx - h / 2, cy - w / 2]);
        this.grow([cx + h / 2, cy + w / 2]);
        this.top.push(textSvg(y.label, cx, cy, SIZE.normal, this.family, this.font, { rotate: 90 }));
      }
    }
  }
}

/** Drop the first few pixels of a segment that starts at a label's own point. */
function trimAtAnchor(s: Seg, anchor: V, r = 7): Seg {
  const [a, b] = s;
  const L = len(sub(b, a));
  if (L <= r) return len(sub(a, anchor)) < 1.5 || len(sub(b, anchor)) < 1.5 ? [anchor, anchor] : s;
  if (len(sub(a, anchor)) < 1.5) return [add(a, mul(sub(b, a), r / L)), b];
  if (len(sub(b, anchor)) < 1.5) return [a, add(b, mul(sub(a, b), r / L))];
  return s;
}

// ---------- area helpers ----------
function busyFill(fl: FillT): boolean {
  if (fl === "none") return false;
  if ("pattern" in fl) return true;
  return fl.grey >= 0.15;
}

function pointInPoly(p: V, poly: V[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- path helpers ----------
function polyPath(pts: V[]): string {
  return pts.map((p, k) => `${k ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join("");
}

function roundedPath(pts: V[], r: number, closed: boolean): string {
  if (!r || pts.length < 3) return polyPath(pts) + (closed ? "Z" : "");
  const n = pts.length;
  let d = "";
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    if (!closed && (k === 0 || k === n - 1)) {
      d += `${k ? "L" : "M"}${f(p[0])} ${f(p[1])}`;
      continue;
    }
    const prev = pts[(k - 1 + n) % n],
      next = pts[(k + 1) % n];
    const rr = Math.min(r, len(sub(prev, p)) / 2, len(sub(next, p)) / 2);
    const a = add(p, mul(norm(sub(prev, p)), rr)),
      b = add(p, mul(norm(sub(next, p)), rr));
    d += `${d ? "L" : "M"}${f(a[0])} ${f(a[1])}Q${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`;
  }
  return d + (closed ? "Z" : "");
}

function catmullCtrl(pts: V[], closed: boolean, tension: number) {
  const n = pts.length;
  const get = (k: number) => (closed ? pts[(k + n) % n] : pts[Math.max(0, Math.min(n - 1, k))]);
  const segs: Cubic[] = [];
  const last = closed ? n : n - 1;
  const t = tension / 3;
  for (let k = 0; k < last; k++) {
    const p0 = get(k - 1),
      p1 = get(k),
      p2 = get(k + 1),
      p3 = get(k + 2);
    const c1 = add(p1, mul(sub(p2, p0), t));
    const c2 = sub(p2, mul(sub(p3, p1), t));
    segs.push([p1, c1, c2, p2]);
  }
  return segs;
}

type Cubic = [V, V, V, V];

function bezierPath(start: V, segs: Cubic[], closed: boolean): string {
  let d = `M${f(start[0])} ${f(start[1])}`;
  for (const [, c1, c2, p2] of segs) d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  return d + (closed ? "Z" : "");
}

/** Fritsch-Carlson monotone cubic: for x-increasing data, the curve never overshoots its points. */
function monotoneCtrl(pts: V[]): Cubic[] {
  const n = pts.length;
  const dx: number[] = [],
    m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1e-9));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i],
      b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  const segs: Cubic[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    segs.push([pts[i], [pts[i][0] + h, pts[i][1] + t[i] * h], [pts[i + 1][0] - h, pts[i + 1][1] - t[i + 1] * h], pts[i + 1]]);
  }
  return segs;
}

function sampleBezier(segs: Cubic[], last: V | null): V[] {
  const out: V[] = [];
  for (const [p1, c1, c2, p2] of segs) {
    for (let k = 0; k < 8; k++) {
      const t = k / 8,
        u = 1 - t;
      out.push([
        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      ]);
    }
  }
  if (last) out.push(last);
  return out;
}

function closestOnBox(p: V, b: Box, gap = 0): V {
  const cx = b.x + b.w / 2,
    cy = b.y + b.h / 2;
  const d = sub(p, [cx, cy]);
  // intersection of ray from centre toward p with box edge
  const sx = d[0] === 0 ? Infinity : (b.w / 2 + gap) / Math.abs(d[0]);
  const sy = d[1] === 0 ? Infinity : (b.h / 2 + gap) / Math.abs(d[1]);
  const s = Math.min(sx, sy, 1);
  return add([cx, cy], mul(d, s));
}

function patternDef(id: string, kind: string, grey: number): string {
  const g = Math.round(255 * (1 - grey));
  const bg = grey ? `<rect width="100%" height="100%" fill="rgb(${g},${g},${g})"/>` : "";
  switch (kind) {
    case "hatch":
      return `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">${bg}<path d="M0 0V7" stroke="#000" stroke-width="0.8"/></pattern>`;
    case "crosshatch":
      return `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">${bg}<path d="M0 0V7M0 0H7" stroke="#000" stroke-width="0.7"/></pattern>`;
    case "dots":
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">${bg || `<rect width="8" height="8" fill="#ececec"/>`}<circle cx="2" cy="2" r="1.1" fill="#000"/><circle cx="6" cy="6" r="1.1" fill="#000"/></pattern>`;
    case "grid":
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">${bg}<path d="M0 0H8M0 0V8" stroke="#888" stroke-width="0.6"/></pattern>`;
    case "waves":
      return `<pattern id="${id}" width="16" height="8" patternUnits="userSpaceOnUse">${bg}<path d="M0 4Q4 1 8 4T16 4" stroke="#000" stroke-width="0.7" fill="none"/></pattern>`;
  }
  return "";
}
