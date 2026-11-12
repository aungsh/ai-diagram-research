import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OutputPanel } from "@/components/output-panel";
import { RunPanel } from "@/components/run-panel";
import { Shell } from "@/components/shell";
import { APPROACHES, listPresets, loadPreset, tries } from "@/lib/fixtures";
import { renderSource } from "@/lib/outputs";
import { getRun, PENDING, ROUNDS, roundOf, testedModels } from "@/lib/results";
import { cn } from "@/lib/utils";

export default async function PresetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const round = roundOf(sp.round);
  const models = testedModels(round);
  const model = typeof sp.model === "string" && models.some((m) => m.id === sp.model) ? sp.model : null;
  const preset = loadPreset(id);
  if (!preset) notFound();
  const { meta, sources } = preset;

  const outputs = model
    ? []
    : await Promise.all(APPROACHES.map(async (a) => (sources[a] ? { a, out: await renderSource(a, sources[a]!, `${id}-${a}`) } : null)));
  const tested = models.find((m) => m.id === model);

  const all = listPresets();
  const next = all[all.findIndex((p) => p.id === id) + 1];

  return (
    <Shell active={id}>
      <div className="mx-auto max-w-[1400px]">
        <p className="text-sm text-muted-foreground">
          {meta.subject}, {meta.topic}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{meta.title}</h1>

        <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="max-w-3xl">
            <p className="whitespace-pre-line leading-relaxed text-foreground/90">{meta.question}</p>
            {meta.figure && (
              <div className="mt-6">
                <h2 className="text-sm font-medium">What the figure must show</h2>
                <p className="mt-1 text-xs text-muted-foreground">Given to every model with the question, in the current round.</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/80">{meta.figure}</p>
              </div>
            )}
          </div>
          {meta.reference && (
            <figure>
              <a href={meta.reference} target="_blank" rel="noreferrer" className="paper block overflow-hidden rounded-lg">
                <Image src={meta.reference} alt="Original figure" width={760} height={760} className="h-auto max-h-80 w-full object-contain" />
              </a>
              <figcaption className="mt-2 text-sm text-muted-foreground">{meta.referenceNote ?? "The original figure."}</figcaption>
            </figure>
          )}
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm text-muted-foreground">Round</span>
          {ROUNDS.map((r) => (
            <Link
              key={r.id}
              href={`/p/${id}?round=${r.id}${model && testedModels(r.id).some((m) => m.id === model) ? `&model=${model}` : ""}`}
              className={cn("rounded-md border px-3 py-1.5 text-sm", round === r.id ? "border-lime/50 bg-muted" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {r.name}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm text-muted-foreground">Drawn by</span>
          <Link
            href={`/p/${id}`}
            className={cn("rounded-md border px-3 py-1.5 text-sm", !model ? "border-lime/50 bg-muted" : "border-border text-muted-foreground hover:text-foreground")}
          >
            Claude Opus 5.5, hand checked
          </Link>
          {models.map((m) => (
            <Link
              key={m.id}
              href={`/p/${id}?round=${round}&model=${m.id}`}
              className={cn("rounded-md border px-3 py-1.5 text-sm", model === m.id ? "border-lime/50 bg-muted" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {m.name}
            </Link>
          ))}
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {tested
            ? `${tested.name} drew these through our test loop: up to three tries, each checked by our code and by the model looking at its own picture. ${tested.runBy.startsWith("Claude Code") ? "It was run as a helper agent inside Claude Code with the same prompts as the API runs." : "It was run through the Gemini API."}`
            : "These were drawn by Claude Opus 5.5 in a coding session and checked by hand, so they are a reference rather than part of the model test. They were not made from the test prompts, so there is no prompt to show for them."}
        </p>

        <div className="mt-8 grid gap-x-10 gap-y-14 lg:grid-cols-2 2xl:grid-cols-3">
          {model && APPROACHES.map((a) => <RunPanel
                key={`${round}-${model}-${a}`}
                method={a}
                run={getRun(model, id, a, round)}
                question={meta.question}
                figure={meta.figure}
                legacy={round === "question-only"}
                pending={round === "brief" ? PENDING[model] : "This model did not reach this question in this round."}
              />)}
          {outputs.map((o) =>
            o ? (
              <OutputPanel
                key={o.a}
                kind={o.a}
                initialSource={sources[o.a]!}
                initialOutput={o.out}
                notes={meta.notes[o.a] ?? []}
                tries={tries(meta, o.a)}
              />
            ) : null,
          )}
        </div>

        {next && (
          <div className="mt-16 border-t border-border pt-6 text-right">
            <Link href={`/p/${next.id}${model ? `?round=${round}&model=${model}` : ""}`} className="text-sm text-muted-foreground hover:text-lime">
              Next: {next.title}
            </Link>
          </div>
        )}
      </div>
    </Shell>
  );
}
