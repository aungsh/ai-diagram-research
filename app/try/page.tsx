import Link from "next/link";
import { Shell } from "@/components/shell";
import { TryForm } from "@/components/try-form";
import { listPresets } from "@/lib/fixtures";

export default function TryPage() {
  const questions = listPresets().map((p) => ({ id: p.id, label: p.title, group: p.subject, question: p.question, figure: p.figure ?? "" }));
  return (
    <Shell active="try">
      <div className="mx-auto max-w-[1400px]">
        <h1 className="text-4xl font-bold tracking-tight">Try a model</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          Paste your own Claude or Gemini API key, pick a model and a question, and watch each try come in. It runs the same loop as the model
          test, with the same prompts and checks.{" "}
          <Link href="/how-it-works#judging" className="text-foreground underline underline-offset-4">
            How attempts are judged
          </Link>
          .
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Gemini keys are free from Google AI Studio, but the free tier allows only about 20 requests a day for Gemini 3.5 Flash. Each try uses
          two requests, one to draw and one to check. Claude keys come from the Claude Console and are paid per use.
        </p>
        <div className="mt-10">
          <TryForm questions={questions} />
        </div>
      </div>
    </Shell>
  );
}
