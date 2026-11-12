export type Approach = "scene" | "tikz" | "svg";

export const APPROACHES: Approach[] = ["scene", "tikz", "svg"];
export const APPROACH_NAME: Record<Approach, string> = { scene: "Our renderer", tikz: "TikZ", svg: "SVG" };
