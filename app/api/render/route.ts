import { renderSource } from "@/lib/outputs";

/** Re-render edited source from the demo UI. POST { kind: "scene" | "tikz" | "svg", source: string } */
export async function POST(request: Request) {
  let body: { kind?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { kind, source } = body;
  if ((kind !== "scene" && kind !== "tikz" && kind !== "svg") || typeof source !== "string") {
    return Response.json({ error: "expected { kind: scene|tikz|svg, source: string }" }, { status: 400 });
  }
  if (source.length > 200_000) return Response.json({ error: "source too large" }, { status: 413 });
  const out = await renderSource(kind, source, "edit");
  return Response.json(out);
}
