"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APPROACH_NAME, type Approach } from "@/lib/approaches";
import type { Output } from "@/lib/outputs";

export function OutputPanel({
  kind,
  initialSource,
  initialOutput,
  notes,
  tries,
}: {
  kind: Approach;
  initialSource: string;
  initialOutput: Output;
  notes: string[];
  tries: number;
}) {
  const [source, setSource] = useState(initialSource);
  const [output, setOutput] = useState(initialOutput);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);

  async function rerender() {
    setBusy(true);
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, source }),
      });
      const data = await res.json();
      setOutput(res.ok ? data : { ok: false, svg: "", ms: 0, warnings: [], errors: [data.error ?? "Request failed"] });
    } catch (e) {
      setOutput({ ok: false, svg: "", ms: 0, warnings: [], errors: [(e as Error).message] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="text-lg font-semibold">{APPROACH_NAME[kind]}</h3>
        <span className="text-sm text-muted-foreground">
          {edited ? "Edited" : tries === 1 ? "Right first time" : `Fixed on try ${tries}`}
        </span>
      </div>

      <Tabs defaultValue="diagram">
        <TabsList variant="line" className="mb-2">
          <TabsTrigger value="diagram">Diagram</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="diagram">
          <div className="paper flex min-h-72 items-center justify-center overflow-hidden rounded-lg p-4">
            {output.svg ? (
              // Our renderer's output is trusted; TikZ and SVG output is sanitised on the server.
              <div className="w-full [&>svg]:mx-auto [&>svg]:block" dangerouslySetInnerHTML={{ __html: output.svg }} />
            ) : (
              <p className="text-sm text-neutral-500">This one did not render.</p>
            )}
          </div>
          {output.errors.length > 0 && (
            <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-destructive">{output.errors.join("\n")}</pre>
          )}
        </TabsContent>

        <TabsContent value="code">
          <textarea
            value={source}
            spellCheck={false}
            onChange={(e) => {
              setSource(e.target.value);
              setEdited(true);
            }}
            className="h-[420px] w-full resize-y rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-lime/50"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={rerender}
              disabled={busy}
              className="h-8 rounded-md bg-lime px-3 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Drawing..." : "Redraw"}
            </button>
            {edited && (
              <button
                onClick={() => {
                  setSource(initialSource);
                  setEdited(false);
                  setOutput(initialOutput);
                }}
                className="h-8 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Undo changes
              </button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <div className="space-y-3 pt-1 text-sm leading-relaxed text-foreground/85">
            {notes.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
