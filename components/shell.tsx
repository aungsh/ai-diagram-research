import Link from "next/link";
import { listPresets, SUBJECTS } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

export function Shell({ active, children }: { active?: string; children: React.ReactNode }) {
  const presets = listPresets();
  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-border px-5 py-8 lg:block">
        <Link href="/" className={cn("text-base font-semibold", !active && "text-lime")}>
          Diagram Lab
        </Link>
        <Link
          href="/how-it-works"
          className={cn(
            "mt-3 block text-sm transition-colors hover:text-foreground",
            active === "how-it-works" ? "text-lime" : "text-foreground/70",
          )}
        >
          How it works
        </Link>
        <Link
          href="/try"
          className={cn("mt-1 block text-sm transition-colors hover:text-foreground", active === "try" ? "text-lime" : "text-foreground/70")}
        >
          Try a model
        </Link>
        <nav className="mt-8 space-y-6">
          {SUBJECTS.map((subject) => (
            <div key={subject}>
              <div className="mb-1.5 text-xs text-muted-foreground">{subject}</div>
              <ul>
                {presets
                  .filter((p) => p.subject === subject)
                  .map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/p/${p.id}`}
                        className={cn(
                          "block py-1 text-sm transition-colors hover:text-foreground",
                          active === p.id ? "text-lime" : "text-foreground/70",
                        )}
                      >
                        {p.title}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-10 md:px-12">{children}</main>
    </div>
  );
}
