import { createHash } from "node:crypto";

/**
 * Compile TikZ to SVG with node-tikzjax (TeX compiled to WebAssembly, runs in-process).
 *
 * Findings from the spike (Nov 2026):
 *  - tikz, pgfplots, circuitikz, chemfig, tikz-3dplot available; ~0.4 s per figure.
 *  - `pattern=` fills are broken (pattern defs are not emitted), so the house preamble
 *    provides \hatchregion and \dotregion built from \clip + \foreach instead.
 *  - Not safe to run concurrently, so compiles are serialised.
 */

export const TIKZ_LIBRARIES =
  "arrows.meta,calc,angles,quotes,decorations.markings,decorations.pathmorphing,intersections,positioning,through,shapes.geometric";

const PGFPLOTS_PREAMBLE = String.raw`\pgfplotsset{compat=1.16}`;

export const TIKZ_PREAMBLE = String.raw`
% Hatched region: \hatchregion{(x1,y1) rectangle (x2,y2)}  (any closed path works)
\newcommand{\hatchregion}[1]{\begin{scope}\clip #1;\foreach \i in {-20,-19.88,...,20}{\draw[line width=0.35pt] (\i,-20)--++(40,40);}\end{scope}}
% Dotted fill (liquids): \dotregion{x1}{y1}{x2}{y2}
\newcommand{\dotregion}[4]{\begin{scope}\fill[gray!12] (#1,#2) rectangle (#3,#4);\clip (#1,#2) rectangle (#3,#4);\pgfmathsetmacro{\dxa}{#1+0.08}\pgfmathsetmacro{\dxb}{#1+0.24}\pgfmathsetmacro{\dya}{#2+0.08}\pgfmathsetmacro{\dyb}{#2+0.24}\foreach \x in {\dxa,\dxb,...,#3}{\foreach \y in {\dya,\dyb,...,#4}{\fill (\x,\y) circle (0.022);}}\end{scope}}
% Fixed surface with hatch ticks: \surface{(x1,y1)}{(x2,y2)}{side}  side = 1 (right of travel) or -1 (left)
\newcommand{\surface}[3]{\draw[line width=1.3pt] #1 -- #2;\path #1 coordinate (s@a) #2 coordinate (s@b);\pgfmathsetmacro{\surfang}{(#3)*90}\foreach \t in {0.02,0.06,...,0.99}{\draw[line width=0.35pt] ($(s@a)!\t!(s@b)$) -- ($($(s@a)!\t!(s@b)$)!0.15cm!\surfang:(s@b)$);}}
`;

const cache = new Map<string, { svg: string; ms: number }>();
let queue: Promise<unknown> = Promise.resolve();

type TexFn = (src: string, opts: Record<string, unknown>) => Promise<string>;
let texFn: TexFn | null = null;

async function getTex(): Promise<TexFn> {
  if (texFn) return texFn;
  const mod = (await import("node-tikzjax")) as unknown as { default: TexFn | { default: TexFn } };
  const d = mod.default;
  texFn = typeof d === "function" ? d : d.default;
  return texFn;
}

export type CompileResult = { ok: true; svg: string; ms: number; cached: boolean } | { ok: false; error: string; ms: number };

export function wrapDocument(body: string): string {
  if (body.includes("\\begin{document}")) return body;
  return `\\begin{document}\n${body}\n\\end{document}`;
}

/** Packages this TeX build ships with. Code may ask for them with \usepackage{...}. */
const ALLOWED_PACKAGES = new Set(["circuitikz", "chemfig", "tikz-cd", "tikz-3dplot", "array", "amstext", "amsfonts"]);

/** Pull \usepackage lines out of the source so they go in the preamble. */
function extractPackages(source: string): { body: string; packages: Record<string, string>; rejected: string[] } {
  const packages: Record<string, string> = {};
  const rejected: string[] = [];
  const body = source.replace(/\\usepackage(?:\[([^\]]*)\])?\{([^}]+)\}\s*/g, (_m, opts: string | undefined, names: string) => {
    for (const name of names.split(",").map((n) => n.trim())) {
      if (ALLOWED_PACKAGES.has(name)) packages[name] = opts ?? "";
      else rejected.push(name);
    }
    return "";
  });
  return { body, packages, rejected };
}

export async function compileTikz(source: string): Promise<CompileResult> {
  const { body, packages, rejected } = extractPackages(source);
  if (rejected.length) return { ok: false, error: `package not available: ${rejected.join(", ")}`, ms: 0 };
  const doc = wrapDocument(body);
  const key0 = JSON.stringify(packages);
  const key = createHash("sha256").update(key0 + doc).digest("hex");
  const hit = cache.get(key);
  if (hit) return { ok: true, svg: hit.svg, ms: hit.ms, cached: true };

  const job = queue.then(async (): Promise<CompileResult> => {
    const t0 = Date.now();
    const logs: string[] = [];
    const origLog = console.log;
    // node-tikzjax prints the TeX log via console.log when showConsole is set; capture it for error reports.
    console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
    try {
      const tex = await getTex();
      // pgfplots is large; loading it next to circuitikz runs TeX out of memory, so only load it when used.
      const usesPlots = /\\begin\{axis\}|\\addplot|\\pgfplotsset/.test(doc);
      const run = tex(doc, {
        texPackages: { ...(usesPlots ? { pgfplots: "" } : {}), amsmath: "", amssymb: "", ...packages },
        tikzLibraries: TIKZ_LIBRARIES,
        addToPreamble: (usesPlots ? PGFPLOTS_PREAMBLE : "") + TIKZ_PREAMBLE,
        showConsole: true,
      });
      // When TeX runs out of memory it can stall instead of failing, so give up after a while.
      const svg = await Promise.race([
        run,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TeX took longer than 20 s and was stopped")), 20_000)),
      ]);
      const ms = Date.now() - t0;
      if (!svg || svg.length < 120) return { ok: false, error: texErrors(logs) || "TeX produced no output", ms };
      cache.set(key, { svg, ms });
      return { ok: true, svg, ms, cached: false };
    } catch (e) {
      return { ok: false, error: texErrors(logs) || (e as Error).message, ms: Date.now() - t0 };
    } finally {
      console.log = origLog;
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Pull the "! ..." error lines (plus the following context line) out of a TeX log. */
function texErrors(logs: string[]): string {
  const lines = logs.join("\n").split("\n");
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (l.startsWith("!")) out.push(l, ...lines.slice(i + 1, i + 3).filter((x) => x.trim()));
  });
  return out.slice(0, 10).join("\n");
}
