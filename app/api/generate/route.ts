import { APPROACHES, type Approach } from "@/lib/approaches";
import { loadPreset } from "@/lib/fixtures";
import { LIVE_MODELS } from "@/lib/models";
import { generatorFor } from "@/lib/pipeline/providers";
import { runAttempts } from "@/lib/pipeline/run";

/**
 * Live run with the visitor's own API key.
 * POST { modelId, apiKey, method, questionId? , question? }
 * Streams one JSON object per line: {type:"attempt"}, {type:"done"} or {type:"error"}.
 * The key is used for this request only. It is never logged or stored.
 */
// Up to three tries, each with a drawing request and a picture check, can take a few minutes.
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { modelId?: string; apiKey?: string; method?: string; questionId?: string; question?: string; figure?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const model = LIVE_MODELS.find((m) => m.id === body.modelId);
  if (!model) return Response.json({ error: "Unknown model." }, { status: 400 });
  if (!body.apiKey || body.apiKey.length < 10) return Response.json({ error: "Paste an API key first." }, { status: 400 });
  if (!APPROACHES.includes(body.method as Approach)) return Response.json({ error: "Unknown method." }, { status: 400 });
  const preset = body.questionId ? loadPreset(body.questionId) : null;
  const question = preset?.meta.question ?? (body.question ?? "").trim();
  if (!question) return Response.json({ error: "Pick a question or write one." }, { status: 400 });
  const figure = preset?.meta.figure ?? (body.figure ?? "").trim();
  if (question.length + figure.length > 6000) return Response.json({ error: "The question is too long." }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: object) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const result = await runAttempts({
          generate: generatorFor(model, body.apiKey!),
          method: body.method as Approach,
          questionId: preset?.meta.id ?? "custom",
          question,
          figure,
          modelId: model.id,
          modelName: model.name,
          runBy: "Live run with the visitor's key",
          onAttempt: (attempt) => send({ type: "attempt", attempt }),
        });
        send({ type: "done", result });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
