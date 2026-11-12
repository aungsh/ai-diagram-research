import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { APPROACHES, type Approach } from "./approaches";

export { APPROACH_NAME, APPROACHES, type Approach } from "./approaches";

export type Meta = {
  id: string;
  subject: (typeof SUBJECTS)[number];
  topic: string;
  title: string;
  question: string;
  /** What the figure must show, as an exam setter would brief it. Given to the model with the question. */
  figure?: string;
  reference?: string;
  referenceNote?: string;
  notes: Record<Approach, string[]>;
  /** How many render and review rounds each output needed. */
  tries: Record<Approach, number>;
};

export type Preset = { meta: Meta; sources: Partial<Record<Approach, string>> };

export const SUBJECTS = [
  "O Level E-Math",
  "O Level Physics",
  "O Level Chemistry",
  "O Level Biology",
  "A Level Physics",
  "A Level Chemistry",
  "A Level Biology",
] as const;
const FILE: Record<Approach, string> = { scene: "scene.json", tikz: "tikz.tex", svg: "svg.svg" };

const ROOT = path.join(process.cwd(), "fixtures");

export function listPresets(): Meta[] {
  const metas = readdirSync(ROOT)
    .filter((d) => existsSync(path.join(ROOT, d, "meta.json")))
    .map((d) => JSON.parse(readFileSync(path.join(ROOT, d, "meta.json"), "utf8")) as Meta);
  return metas.sort((a, b) => SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || a.id.localeCompare(b.id));
}

export function loadPreset(id: string): Preset | null {
  // Only ids that exist as fixture folders are allowed (no path traversal).
  const meta = listPresets().find((m) => m.id === id);
  if (!meta) return null;
  const sources: Preset["sources"] = {};
  for (const a of APPROACHES) {
    const f = path.join(ROOT, id, FILE[a]);
    if (existsSync(f)) sources[a] = readFileSync(f, "utf8");
  }
  return { meta, sources };
}

export function tries(meta: Meta, a: Approach): number {
  return meta.tries?.[a] ?? 1;
}
