"use client";

import { useState } from "react";
import { RunPanel } from "@/components/run-panel";
import { APPROACH_NAME, APPROACHES, type Approach } from "@/lib/approaches";
import { LIVE_MODELS } from "@/lib/models";
import type { Attempt, RunResult } from "@/lib/pipeline/attempts";

type QuestionOption = { id: string; label: string; group: string; question: string; figure: string };

export function TryForm({ questions }: { questions: QuestionOption[] }) {
  const [modelId, setModelId] = useState(LIVE_MODELS[1].id);
  const [apiKey, setApiKey] = useState("");
  const [questionId, setQuestionId] = useState(questions[0]?.id ?? "custom");
  const [custom, setCustom] = useState("");
  const [customFigure, setCustomFigure] = useState("");
  const [methods, setMethods] = useState<Approach[]>(["scene"]);
  const [runs, setRuns] = useState<Partial<Record<Approach, RunResult | null>>>({});
  const [busy, setBusy] = useState<Approach | null>(null);
  const [error, setError] = useState<string | null>(null);

  const model = LIVE_MODELS.find((m) => m.id === modelId)!;

  async function runOne(method: Approach) {
    setBusy(method);
    const partial: RunResult = {
      modelId,
      modelName: model.name,
      method,
      questionId,
      runBy: "Live run",
      ranAt: new Date().toISOString(),
      attempts: [],
      chosen: 1,
      accepted: false,
    };
    setRuns((r) => ({ ...r, [method]: { ...partial } }));
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelId, apiKey, method, ...(questionId === "custom" ? { question: custom, figure: customFigure } : { questionId }) }),
    });
    if (!res.ok || !res.body) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "The request failed.");
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "attempt") {
          partial.attempts = [...partial.attempts, ev.attempt as Attempt];
          partial.chosen = ev.attempt.n;
          setRuns((r) => ({ ...r, [method]: { ...partial } }));
        } else if (ev.type === "done") {
          setRuns((r) => ({ ...r, [method]: ev.result }));
        } else if (ev.type === "error") {
          throw new Error(ev.message);
        }
      }
    }
  }

  async function run() {
    setError(null);
    setRuns({});
    try {
      for (const m of methods) await runOne(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const label = "mb-1.5 block text-sm text-muted-foreground";
  const field = "h-9 w-full rounded-md border border-border bg-muted/40 px-3 text-sm outline-none focus:border-lime/50";

  return (
    <div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className={label}>Model</label>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className={field}>
            {LIVE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.free ? ", free tier" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>{model.provider === "gemini" ? "Gemini API key" : "Claude API key"}</label>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={model.provider === "gemini" ? "From Google AI Studio" : "From the Claude Console"}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Question</label>
          <select value={questionId} onChange={(e) => setQuestionId(e.target.value)} className={field}>
            {Object.entries(Object.groupBy(questions, (q) => q.group)).map(([g, qs]) => (
              <optgroup key={g} label={g}>
                {qs!.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="custom">Write my own question</option>
          </select>
        </div>
        <div>
          <label className={label}>Methods</label>
          <div className="flex h-9 items-center gap-4">
            {APPROACHES.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={methods.includes(a)}
                  onChange={(e) => setMethods((ms) => (e.target.checked ? APPROACHES.filter((x) => x === a || ms.includes(x)) : ms.filter((x) => x !== a)))}
                  className="accent-[var(--lime)]"
                />
                {APPROACH_NAME[a]}
              </label>
            ))}
          </div>
        </div>
      </div>

      {questionId === "custom" && (
        <div className="mt-5">
          <label className={label}>Your question</label>
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            rows={5}
            placeholder="Paste the question text."
            className="w-full rounded-md border border-border bg-muted/40 p-3 text-sm outline-none focus:border-lime/50"
          />
          <label className={`${label} mt-4`}>What the figure must show</label>
          <textarea
            value={customFigure}
            onChange={(e) => setCustomFigure(e.target.value)}
            rows={5}
            placeholder="Describe the figure: what is in it, how the parts relate, and which labels and values to show."
            className="w-full rounded-md border border-border bg-muted/40 p-3 text-sm outline-none focus:border-lime/50"
          />
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={run}
          disabled={!!busy || !apiKey || !methods.length || (questionId === "custom" && !custom.trim())}
          className="h-9 rounded-md bg-lime px-4 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? `Drawing with ${APPROACH_NAME[busy]}...` : "Draw"}
        </button>
        <p className="text-sm text-muted-foreground">Your key is sent with this request only. It is not saved anywhere.</p>
      </div>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {Object.keys(runs).length > 0 && (
        <div className="mt-12 grid gap-x-10 gap-y-14 lg:grid-cols-2 2xl:grid-cols-3">
          {methods.map((m) =>
            m in runs ? (
              <div key={m}>
                <RunPanel
                  key={`${m}-${runs[m]?.attempts.length}`}
                  method={m}
                  run={runs[m]?.attempts.length ? runs[m]! : null}
                  question={questionId === "custom" ? custom : (questions.find((q) => q.id === questionId)?.question ?? "")}
                  figure={questionId === "custom" ? customFigure : questions.find((q) => q.id === questionId)?.figure}
                />
                {busy === m && <p className="mt-3 text-sm text-muted-foreground">Working on the next try. Each try takes from a few seconds to a couple of minutes.</p>}
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
