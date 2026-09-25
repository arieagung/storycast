import { AnimatePresence, motion } from "motion/react";
import { Check, Clapperboard, Download, FileCode2, Lock, Mic, Share2, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TodoList, type TodoItem } from "@/components/agents/todo-list";
import { FilmPlayer } from "@/components/app/film-player";
import { FolderBar } from "@/components/app/folder-bar";
import { downloadFile } from "@/components/app/lightbox";
import { CopyButton, TaskCard } from "@/components/app/task-card";
import { Button } from "@/components/motion/button/base";
import { api, clock } from "@/lib/api";
import { EASE_OUT } from "@/lib/ease";
import { navigate } from "@/lib/router";
import { SHARING } from "@/lib/share";
import { downloadText, folderBound, useFolder } from "@/lib/studio/assets";
import type { ManualTask, Stage, Studio } from "@/lib/studio/manual";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *\
   Floating section nav
\* ------------------------------------------------------------------ */

function SectionNav({ stages, activeKey }: { stages: Stage[]; activeKey: string | null }) {
  if (!stages.length) return null;
  // A stage is expanded when it is open or when one of its tasks is active.
  const activeStage = stages.find((s) => s.tasks.some((t) => `task-${t.key}` === activeKey))?.key ?? activeKey?.replace("stage-", "");
  return (
    <nav aria-label="Jump to section" className="sticky top-24 flex flex-col gap-0.5 self-start">
      {stages.map((s) => {
        const dot =
          s.state === "done"
            ? "bg-success"
            : s.state === "open"
              ? "bg-primary"
              : "bg-muted-foreground/30";
        const stageActive = activeStage === s.key;
        const expanded = s.state !== "locked" && (stageActive || s.state === "open");
        return (
          <div key={s.key}>
            <a
              href={`#stage-${s.key}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`stage-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              aria-current={stageActive && !activeKey?.startsWith("task-") ? "location" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs transition-colors",
                stageActive && !activeKey?.startsWith("task-")
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full transition-colors", dot)} />
              <span className="truncate max-w-[7rem]">{s.label}</span>
              {s.total > 0 && (
                <span className={cn("ml-auto shrink-0 font-mono text-[10px] tabular-nums", s.state === "done" ? "text-success" : "text-muted-foreground")}>
                  {s.done}/{s.total}
                </span>
              )}
            </a>
            {expanded && s.tasks.length > 1 && (
              <div className="ml-5 flex flex-col gap-0.5 border-l border-border pl-2 py-0.5">
                {s.tasks.map((t) => {
                  const taskActive = activeKey === `task-${t.key}`;
                  return (
                    <a
                      key={t.key}
                      href={`#task-${t.key}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(`task-${t.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      aria-current={taskActive ? "location" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] transition-colors",
                        taskActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <span className={cn("size-1 shrink-0 rounded-full", t.done ? "bg-success" : "bg-muted-foreground/40")} />
                      <span className="truncate max-w-[8rem]">{t.title}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ *\
   The edit, once everything else exists
\* ------------------------------------------------------------------ */

function RenderPanel({ studio, onBuilt }: { studio: Studio; onBuilt: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [written, setWritten] = useState<number | undefined>(studio.st.built);
  let kit: ReturnType<Studio["kit"]> | null = null;
  try {
    kit = studio.kit();
  } catch {
    kit = null;
  }
  if (!kit) return null;
  const files = studio.kitFiles(kit);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-strong bg-card/60 p-3.5">
      <div>
        <p className="text-sm font-medium">The cut, worked out for you</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {kit.steps.length} ffmpeg steps, {Math.round(kit.total)} s of film. Subtitles are written from the script and the narration lengths, so nothing has to be transcribed.
          {kit.ambience.length ? ` ${kit.ambience.length} shot${kit.ambience.length === 1 ? "" : "s"} keep their own sound.` : " Shot sound is left out; turn it on per shot above."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || !folderBound()}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              if (await studio.build()) {
                setWritten(studio.st.built);
                onBuilt();
              } else setError("Could not write into the folder. Download the files instead.");
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <FileCode2 className="size-3.5" /> {written ? "Write the kit again" : "Write the kit into the folder"}
        </Button>
        {files.map((f) => (
          <Button key={f.path} size="sm" variant="secondary" onClick={() => downloadText(f.path.split("/").pop()!, f.text)} title={f.note}>
            <Download className="size-3.5" /> {f.path}
          </Button>
        ))}
      </div>

      {written ? (
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Check className="size-3.5 text-success" /> Written into the folder
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Now run it in the film&apos;s folder. It leaves film.mp4 and clean.mp4 next to the script.</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {[
              ["Windows", `powershell -ExecutionPolicy Bypass -File .\\render.ps1`],
              ["macOS / Linux", `bash render.sh`],
            ].map(([os, cmd]) => (
              <div key={os} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{os}</span>
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px]">{cmd}</code>
                <CopyButton text={cmd} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <details className="rounded-xl border border-border bg-background/40">
        <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
          <Terminal className="mr-1.5 inline size-3.5" /> Every command, if you would rather run them one at a time
        </summary>
        <div className="flex flex-col gap-2 px-3 pb-3">
          {kit.steps.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-background/60">
              <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                  <span className="text-foreground/80">{s.label}</span> · {s.note}
                </span>
                <CopyButton text={s.command} />
              </div>
              <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[10.5px] whitespace-pre-wrap text-foreground/80">{s.command}</pre>
            </div>
          ))}
        </div>
      </details>

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ *\
   The board
\* ------------------------------------------------------------------ */

function stageItems(stages: Stage[]): TodoItem[] {
  return stages.map((s) => ({
    id: s.key,
    title: s.label,
    status: s.state === "done" ? "completed" : s.state === "locked" ? "pending" : "in-progress",
    progress: s.total ? Math.round((s.done / s.total) * 100) : undefined,
    detail: (
      <span className="block max-w-[12rem] truncate text-[11px] sm:max-w-[15rem]">
        {s.state === "locked" ? s.locked : s.total ? `${s.done} of ${s.total} done` : s.note}
      </span>
    ),
  }));
}

export function StudioPanel({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<ManualTask[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [found, setFound] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { state: folder } = useFolder();
  const busy = useRef(false);

  const draw = useCallback(
    async (s: Studio) => {
      const board = await s.board();
      setTasks(board.tasks);
      setStages(board.stages);
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!studio) return;
    await draw(studio);
    onChanged?.();
  }, [studio, draw, onChanged]);

  useEffect(() => {
    let live = true;
    setStudio(null);
    api
      .open(id)
      .then(async (s) => {
        if (!live) return;
        await s.prepare();
        setStudio(s);
        await draw(s);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [id, draw]);

  const sync = useCallback(
    async (quiet = false) => {
      if (!studio || busy.current || !folderBound()) return;
      busy.current = true;
      if (!quiet) setSyncing(true);
      try {
        const n = await studio.sync();
        if (n) {
          await draw(studio);
          onChanged?.();
        }
        if (!quiet) setFound(n);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        busy.current = false;
        setSyncing(false);
      }
    },
    [studio, draw, onChanged],
  );

  // Look once as soon as a folder is available, then every time you come back to the tab.
  useEffect(() => {
    if (!studio || folder !== "ok") return;
    void sync(true);
    const back = () => void sync(true);
    window.addEventListener("focus", back);
    return () => window.removeEventListener("focus", back);
  }, [studio, folder, sync]);

  const actionsFor = (task: ManualTask) => ({
    onSubmit: async (raw: string) => {
      const w = await studio!.submit(task.key, raw);
      await refresh();
      return w;
    },
    onSkip: task.key === "script-edit" ? async () => (await studio!.skip(task.key), refresh()) : undefined,
    onFile: async (f: File) => {
      await studio!.attach(task, f);
      await refresh();
    },
    onClear: async () => {
      await studio!.clear(task);
      await refresh();
    },
    onLine: task.block ? async (t: string) => (await studio!.setLine(task.block!.id, t), refresh()) : undefined,
    onDemote: task.block?.kind === "T" ? async () => (await studio!.demote(task.block!.id), refresh()) : undefined,
    onScene: task.stage === "keyframes" && task.shot ? async (s: string) => (await studio!.rescene(task.shot!, s), refresh()) : undefined,
    onPlain: task.stage === "keyframes" && task.shot ? async (on: boolean) => (await studio!.plainly(task.shot!, on), refresh()) : undefined,
    onMute: task.stage === "shots" && task.shot ? async (on: boolean) => (await studio!.mute(task.shot!, on), refresh()) : undefined,
    onConfirm: task.stage === "shots" && task.shot && task.warn ? async () => (await studio!.confirmShot(task.shot!), refresh()) : undefined,
  });

  const plan = studio?.plan;
  const total = tasks.filter((t) => !t.optional).length;
  const done = tasks.filter((t) => !t.optional && t.done).length;
  const result = studio?.st.film ? studio.result() : null;
  const events = (studio?.rec.events ?? []) as { t: number; stage: string; msg: string }[];

  // Track which section/task is currently visible for the nav highlight.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  useEffect(() => {
    if (!stages.length) return;
    const ids = [
      ...stages.map((s) => `stage-${s.key}`),
      ...stages.flatMap((s) => s.tasks.map((t) => `task-${t.key}`)),
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActiveKey(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [stages]);

  if (!studio)
    return (
      <div className="rounded-3xl border border-border bg-card/40 p-8">
        {error ? <p className="text-sm text-destructive">{error}</p> : <div className="h-40 animate-pulse rounded-2xl bg-muted" />}
      </div>
    );

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="flex flex-col gap-5 rounded-3xl border border-border bg-card/40 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs tracking-wider text-muted-foreground uppercase">{result ? "Finished" : done ? "In production" : "Ready to start"}</p>
          <h2 className="mt-1 truncate text-2xl font-medium tracking-tight">{plan ? `${plan.title} ${plan.subtitle}` : studio.rec.topic}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {studio.rec.style_label} · {studio.rec.minutes} min · {done} of {total} steps done
          </p>
        </div>
        <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted sm:w-48">
          <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${total ? (done / total) * 100 : 0}%` }} transition={{ duration: 0.4, ease: EASE_OUT }} />
        </div>
      </div>

      <FolderBar project={studio.project} onSync={() => void sync()} syncing={syncing} />
      {found !== null && (
        <p className="text-[11.5px] text-muted-foreground">{found ? `Picked up ${found} file${found === 1 ? "" : "s"}.` : "Nothing new in the folder yet."}</p>
      )}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.45, ease: EASE_OUT }} className="overflow-hidden">
            <FilmPlayer src={result.video} cleanSrc={result.clean} poster={result.poster} className="border border-border" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{result.duration} s · in your folder</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await downloadFile(result.video, `${studio.project}.mp4`);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Download className="size-4" /> {saving ? "Saving…" : "Save a copy"}
                </Button>
                <Button size="md" onClick={() => navigate(`/films/${studio.rec.id}`)}>
                  <Share2 className="size-4" /> {SHARING ? "Watch & share" : "Open the film page"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Three-column layout on large screens: nav | sidebar info | stage content */}
      <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,260px)_1fr]">

        {/* ── Column 1: floating section nav ── */}
        <div className="hidden lg:block">
          <SectionNav stages={stages} activeKey={activeKey} />
        </div>

        {/* ── Column 2: sidebar (checklist, script, log) ── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Mobile-only nav (horizontal pill row) */}
          {stages.length > 0 && (
            <nav aria-label="Jump to section" className="flex flex-wrap gap-1.5 lg:hidden">
              {stages.map((s) => (
                <a
                  key={s.key}
                  href={`#stage-${s.key}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`stage-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    s.state === "done"
                      ? "border-success/30 bg-success/10 text-success"
                      : s.state === "open"
                        ? "border-border-strong bg-muted text-foreground"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {s.state === "done" && <Check className="size-2.5" />}
                  {s.state === "locked" && <Lock className="size-2.5" />}
                  {s.label}
                  {s.total > 1 && <span className="font-mono text-[10px] opacity-70">{s.done}/{s.total}</span>}
                </a>
              ))}
            </nav>
          )}
          <TodoList items={stageItems(stages)} title="Steps" collapseOnComplete={false} maxHeight={460} />
          {plan && (
            <div className="rounded-2xl border border-border bg-background/50 p-3">
              <p className="text-xs text-muted-foreground">
                Script · narrated by <span className="text-foreground">{plan.character.name}</span>
              </p>
              <ol className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto pr-1 text-[12.5px] leading-relaxed">
                {plan.blocks.map((b, i) => (
                  <li key={b.id || i} className="flex gap-2.5">
                    <span className="mt-0.5 w-5 shrink-0 font-mono text-[10.5px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <span className={cn(b.kind === "T" ? "text-foreground" : "text-muted-foreground")}>
                      {b.kind === "T" && <Mic className="mr-1.5 inline size-3 -translate-y-px text-accent" />}
                      {b.text}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {events.length > 0 && (
            <div className="max-h-52 overflow-y-auto rounded-2xl border border-border bg-background/50 p-3 font-mono text-[11px] leading-relaxed">
              {events.map((e, i) => (
                <div key={i} className="flex gap-2 text-muted-foreground">
                  <span className="shrink-0 opacity-60">{clock(e.t)}</span>
                  <span className="min-w-0">{e.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Column 3: stage sections ── */}
        <div className="flex min-w-0 flex-col gap-6">
          {stages.map((stage) => (
            <section id={`stage-${stage.key}`} key={stage.key} className="flex scroll-mt-28 flex-col gap-3">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  {stage.state === "locked" && <Lock className="size-3.5 text-muted-foreground" />}
                  {stage.state === "done" && <Check className="size-3.5 text-success" />}
                  {stage.label}
                  {stage.total > 1 && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {stage.done}/{stage.total}
                    </span>
                  )}
                </h3>
                <p className="min-w-0 flex-1 truncate text-right text-[11.5px] text-muted-foreground">{stage.state === "locked" ? stage.locked : stage.note}</p>
              </header>
              {stage.key === "edit" && stage.state !== "locked" && <RenderPanel studio={studio} onBuilt={() => void refresh()} />}
              {stage.tasks.length > 0 && (
                <div className="flex flex-col gap-3">
                  {stage.tasks.map((task) => (
                    <div key={task.key} id={`task-${task.key}`} className="scroll-mt-28">
                      <TaskCard task={task} actions={actionsFor(task)} projectRoot={studio.project} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
          {!stages.length && (
            <p className="rounded-2xl border border-dashed border-border-strong bg-background/30 p-6 text-center text-sm text-muted-foreground">
              <Clapperboard className="mx-auto mb-2 size-5" />
              Nothing to do yet.
            </p>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">{error}</p>}
    </motion.section>
  );
}
