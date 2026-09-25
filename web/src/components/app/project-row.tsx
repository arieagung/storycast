import { Check, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/motion/button/base";
import type { Job } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS: Record<Job["status"], string> = { draft: "not started", working: "in progress", done: "finished" };

/** Films of yours that are part-made, so a session can be picked up days later. */
export function ProjectRow({
  projects,
  current,
  onOpen,
  onDiscard,
  onNew,
}: {
  projects: Job[];
  current: string | null;
  onOpen: (id: string) => void;
  onDiscard: (id: string) => Promise<void>;
  onNew: () => void;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  if (!projects.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your projects</p>
        {current && (
          <Button size="sm" variant="ghost" onClick={onNew}>
            <Plus className="size-3.5" /> Start another film
          </Button>
        )}
      </div>
      <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {projects.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex w-64 shrink-0 flex-col gap-1.5 rounded-2xl border p-3 transition-colors",
              current === p.id ? "border-border-strong bg-card" : "border-border bg-card/40 hover:border-border-strong",
            )}
          >
            <button type="button" onClick={() => onOpen(p.id)} className="min-w-0 text-left">
              <p className="truncate text-sm font-medium">{p.title || p.topic}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {p.status === "done" ? <Check className="mr-1 inline size-3 text-success" /> : null}
                {STATUS[p.status]} · {p.style_label} · {p.minutes} min
              </p>
              <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10.5px] text-muted-foreground/80">
                <FolderOpen className="size-3 shrink-0" /> {p.project}
              </p>
            </button>
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant={current === p.id ? "secondary" : "primary"} onClick={() => onOpen(p.id)}>
                {current === p.id ? "Open" : p.status === "draft" ? "Start" : "Continue"}
              </Button>
              {asking === p.id ? (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => void onDiscard(p.id).finally(() => setAsking(null))} className="rounded-full border border-destructive/40 px-2 py-0.5 text-[10.5px] text-destructive">
                    Remove
                  </button>
                  <button type="button" onClick={() => setAsking(null)} className="rounded-full px-2 py-0.5 text-[10.5px] text-muted-foreground">
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAsking(p.id)}
                  title="Forget this project (your files stay)"
                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
