import { z } from "zod";

/**
 * Scene spec (approach C).
 *
 * The model describes WHAT is in the diagram; our renderer decides HOW it is drawn.
 * World coordinates are maths-style (y up). Units are arbitrary; `unit` sets px per unit.
 * Geometry that must be exact (points on circles, tangents, midpoints, ratios, angle arcs)
 * is computed here, never estimated by the model.
 */

export const Vec = z.tuple([z.number(), z.number()]);
/** A point reference: a named point id, or literal [x, y]. */
export const PointRef = z.union([z.string(), Vec]);

const Dir = z.enum(["auto", "n", "ne", "e", "se", "s", "sw", "w", "nw", "c"]);

export const PointDef = z
  .object({
    /** Absolute position. */
    at: Vec.optional(),
    /** Position in graph (data) units: scaled by the scene's axes sx/sy. Use for points on plots. */
    graph: Vec.optional(),
    /** Polar position around a centre (degrees, anticlockwise from +x). */
    polar: z.object({ center: PointRef.default([0, 0]), r: z.number(), deg: z.number() }).optional(),
    /** Midpoint of two points. */
    mid: z.tuple([PointRef, PointRef]).optional(),
    /** A + t (B - A). t = 0.25 gives the point a quarter of the way from A to B. */
    along: z.object({ from: PointRef, to: PointRef, t: z.number() }).optional(),
    /** Intersection of two infinite lines, each given by two points. */
    intersect: z.tuple([z.tuple([PointRef, PointRef]), z.tuple([PointRef, PointRef])]).optional(),
    /** Translate another point. */
    offset: z.object({ from: PointRef, dx: z.number().default(0), dy: z.number().default(0) }).optional(),
    /** Point at distance d from `from`, in direction `deg`. Bearing-friendly when `bearing` is true (clockwise from north). */
    move: z.object({ from: PointRef, d: z.number(), deg: z.number(), bearing: z.boolean().default(false) }).optional(),
    /** Foot of perpendicular from `from` to the line through `line`. */
    foot: z.object({ from: PointRef, line: z.tuple([PointRef, PointRef]) }).optional(),
    /** Intersection of line (through two points) with a circle; `pick` 0 or 1 chooses which. */
    lineCircle: z
      .object({ line: z.tuple([PointRef, PointRef]), center: PointRef, r: z.number(), pick: z.number().int().min(0).max(1).default(0) })
      .optional(),
    /** External point where tangents at two circle points meet. */
    tangentsMeet: z.object({ center: PointRef, a: PointRef, b: PointRef }).optional(),

    label: z.string().optional(),
    labelDir: Dir.default("auto"),
    dot: z.boolean().default(false),
  })
  .refine(
    (p) =>
      [p.at, p.graph, p.polar, p.mid, p.along, p.intersect, p.offset, p.move, p.foot, p.lineCircle, p.tangentsMeet].filter(
        (v) => v !== undefined,
      ).length === 1,
    { message: "point must use exactly one of: at, graph, polar, mid, along, intersect, offset, move, foot, lineCircle, tangentsMeet" },
  );

export const Fill = z.union([
  z.literal("none"),
  /** Grey level 0 (white) .. 1 (black). */
  z.object({ grey: z.number().min(0).max(1) }),
  z.object({ pattern: z.enum(["hatch", "crosshatch", "dots", "grid", "waves"]), grey: z.number().min(0).max(1).optional() }),
]);

const Stroke = z.object({
  style: z.enum(["solid", "dashed", "dotted"]).default("solid"),
  weight: z.enum(["thin", "normal", "thick", "heavy"]).default("normal"),
  grey: z.number().min(0).max(1).default(1),
});

const strokeFields = {
  style: Stroke.shape.style,
  weight: Stroke.shape.weight,
  grey: Stroke.shape.grey,
};

const EdgeLabel = z.object({
  text: z.string(),
  /** Which side of the directed segment (from -> to) the label sits on. */
  side: z.enum(["left", "right", "auto"]).default("auto"),
  pos: z.number().min(0).max(1).default(0.5),
});

export const Element = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("segment"),
    from: PointRef,
    to: PointRef,
    ...strokeFields,
    /** Arrowheads. `mid` puts an arrowhead halfway (vector convention). */
    arrow: z.enum(["none", "end", "start", "both", "mid"]).default("none"),
    /** Extend beyond `to` by this many units (for "produced" lines and tangents). */
    extend: z.number().default(0),
    extendBack: z.number().default(0),
    label: EdgeLabel.optional(),
    /** Equal-length tick marks. */
    ticks: z.number().int().min(0).max(3).default(0),
    /** Parallel-line arrow marks. */
    parallel: z.number().int().min(0).max(3).default(0),
  }),
  z.object({
    type: z.literal("polygon"),
    points: z.array(PointRef).min(2),
    closed: z.boolean().default(true),
    ...strokeFields,
    fill: Fill.default("none"),
    /** Corner rounding radius in units. */
    round: z.number().default(0),
  }),
  z.object({
    type: z.literal("rect"),
    at: PointRef,
    w: z.number(),
    h: z.number(),
    ...strokeFields,
    fill: Fill.default("none"),
    round: z.number().default(0),
    rotate: z.number().default(0),
  }),
  z.object({
    type: z.literal("circle"),
    center: PointRef,
    r: z.number(),
    ...strokeFields,
    fill: Fill.default("none"),
  }),
  z.object({
    type: z.literal("ellipse"),
    center: PointRef,
    rx: z.number(),
    ry: z.number(),
    rotate: z.number().default(0),
    ...strokeFields,
    fill: Fill.default("none"),
  }),
  z.object({
    type: z.literal("arc"),
    center: PointRef,
    r: z.number(),
    from: z.number(),
    to: z.number(),
    ...strokeFields,
  }),
  /** Smooth closed or open curve through points (Catmull-Rom). Good for cells, organs, tubing. */
  z.object({
    type: z.literal("curve"),
    points: z.array(PointRef).min(2),
    closed: z.boolean().default(false),
    tension: z.number().default(0.5),
    /** For graph-like curves whose x always increases: never overshoots between points. */
    monotone: z.boolean().default(false),
    ...strokeFields,
    fill: Fill.default("none"),
  }),
  /** Angle mark at vertex `at` between rays to `a` and `b`. Draws the smaller angle unless reflex. */
  z.object({
    type: z.literal("angle"),
    at: PointRef,
    a: PointRef,
    b: PointRef,
    label: z.string().optional(),
    r: z.number().optional(),
    right: z.boolean().default(false),
    reflex: z.boolean().default(false),
    double: z.boolean().default(false),
  }),
  /** Tangent line to a circle at a point on it. */
  z.object({
    type: z.literal("tangent"),
    center: PointRef,
    at: PointRef,
    /** Length either side of the touch point, in units. */
    before: z.number().default(2),
    after: z.number().default(2),
    ...strokeFields,
  }),
  /** Coordinate axes with optional grid (graph paper). */
  z.object({
    type: z.literal("axes"),
    x: z.object({ min: z.number(), max: z.number(), step: z.number(), label: z.string().optional(), minor: z.number().int().default(0), numbers: z.boolean().default(true) }),
    y: z.object({ min: z.number(), max: z.number(), step: z.number(), label: z.string().optional(), minor: z.number().int().default(0), numbers: z.boolean().default(true) }),
    grid: z.enum(["none", "major", "minor"]).default("none"),
    /** "cross" = axes through origin; "box" = axes on left/bottom edges. */
    mode: z.enum(["cross", "box"]).default("cross"),
    /** Scale factors so axes can use data units while the page stays in proportion. */
    sx: z.number().default(1),
    sy: z.number().default(1),
    originLabel: z.boolean().default(true),
    /** Boxed axes only: draw a solid line at y = 0, for example for a wave. */
    zeroLine: z.boolean().default(false),
  }),
  /** y = f(x), evaluated with mathjs (safe). Coordinates are scaled by the axes sx/sy if `axes` given. */
  z.object({
    type: z.literal("plot"),
    fn: z.string(),
    domain: z.tuple([z.number(), z.number()]),
    samples: z.number().int().default(200),
    sx: z.number().default(1),
    sy: z.number().default(1),
    ...strokeFields,
  }),
  /** Piecewise-linear data in graph units (scaled by sx/sy). */
  z.object({
    type: z.literal("polyline"),
    points: z.array(Vec).min(2),
    sx: z.number().default(1),
    sy: z.number().default(1),
    ...strokeFields,
  }),
  /** Arrow with semantic kind. force: bold, labelled at tip; pointer: thin; dimension: double-headed with end bars. */
  z.object({
    type: z.literal("arrow"),
    from: PointRef,
    to: PointRef,
    kind: z.enum(["force", "pointer", "dimension", "flow"]).default("pointer"),
    label: z.string().optional(),
    labelAt: z.enum(["tip", "tail", "mid"]).optional(),
  }),
  /** Free text at a position. */
  z.object({
    type: z.literal("text"),
    at: PointRef,
    text: z.string(),
    anchor: Dir.default("c"),
    size: z.enum(["small", "normal", "large"]).default("normal"),
    rotate: z.number().default(0),
    font: z.enum(["serif", "sans"]).optional(),
    /** White halo behind the text so it stays legible over fills and lines. */
    halo: z.boolean().default(false),
  }),
  /** Label with a leader line pointing at `target`. Placement is automatic unless `at` given. */
  z.object({
    type: z.literal("callout"),
    target: PointRef,
    text: z.string(),
    at: PointRef.optional(),
    /** Preferred direction from target to the label. */
    dir: Dir.default("auto"),
    /** Preferred leader length in units. */
    dist: z.number().optional(),
  }),
  /** Exam convention for a fixed surface (wall, ground, ceiling): thick line with hatch ticks on one side. */
  z.object({
    type: z.literal("surface"),
    from: PointRef,
    to: PointRef,
    /** Side of the directed line (from -> to) where the hatching goes. */
    side: z.enum(["left", "right"]).default("right"),
  }),
  /** Spring / coil between two points. */
  z.object({
    type: z.literal("spring"),
    from: PointRef,
    to: PointRef,
    coils: z.number().int().default(8),
    width: z.number().default(0.3),
  }),
  /** Liquid in a container region: filled polygon plus a meniscus/surface line. */
  z.object({
    type: z.literal("liquid"),
    points: z.array(PointRef).min(3),
    fill: Fill.default({ pattern: "dots" }),
  }),
  /** Draw bubbles/particles inside a rect, deterministic layout. */
  z.object({
    type: z.literal("bubbles"),
    at: PointRef,
    w: z.number(),
    h: z.number(),
    count: z.number().int().default(8),
    r: z.number().default(0.08),
    seed: z.number().int().default(1),
  }),
]);

export const Scene = z.object({
  /** px per world unit. */
  unit: z.number().default(48),
  /** Optional fixed viewport in world units; otherwise auto-fit with padding. */
  view: z.object({ xmin: z.number(), xmax: z.number(), ymin: z.number(), ymax: z.number() }).optional(),
  caption: z.string().optional(),
  /** Diagram text font. Exam papers use serif for maths, sans for science apparatus. */
  font: z.enum(["serif", "sans"]).default("serif"),
  points: z.record(z.string(), PointDef).default({}),
  elements: z.array(Element).default([]),
  /** Note shown under the figure, e.g. "Not drawn to scale". */
  note: z.string().optional(),
});

export type SceneInput = z.input<typeof Scene>;
export type SceneT = z.output<typeof Scene>;
export type ElementT = z.output<typeof Element>;
export type PointDefT = z.output<typeof PointDef>;
export type FillT = z.output<typeof Fill>;
export type PointRefT = z.output<typeof PointRef>;
