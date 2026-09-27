import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  Edit,
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Art } from "@/components/app/lightbox";
import { Button } from "@/components/motion/button/base";
import { EASE_OUT } from "@/lib/ease";
import { downloadRef, isLocalRef, useMediaUrl, type AssetInfo } from "@/lib/studio/assets";
import type { ManualTask } from "@/lib/studio/manual";

/** Label shown above the prompt field, based on what the task expects. */
function promptLabel(task: ManualTask): string {
  if (task.kind === "audio") return "Text to speak";
  if (task.kind === "json") return "Prompt (system + user)";
  if (task.kind === "srt") return "Prompt (system + user)";
  if (task.kind === "video" && !task.prompt) return "";
  return "Prompt";
}

import { cn } from "@/lib/utils";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.append(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      onClick={async () => {
        await writeClipboard(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-40",
        className,
      )}
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />}
      {done ? "Copied" : label}
    </button>
  );
}

function Field({ title, body, aside }: { title: string; body: string; aside?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/60">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</span>
        <div className="flex items-center gap-1.5">
          {aside}
          <CopyButton text={body} />
        </div>
      </div>
      <pre className="max-h-64 overflow-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-foreground/90">{body}</pre>
    </div>
  );
}

function Fold({ title, children, open: initial = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="rounded-xl border border-border bg-background/40">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground">
        <span>{title}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="overflow-hidden">
            <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RefRow({ n, label, url, note, kind }: { n: number; label: string; url: string; note?: string; kind: "image" | "audio" | "video" }) {
  const resolved = useMediaUrl(url);
  const missing = !resolved;
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 p-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted font-mono text-[10px] text-muted-foreground">{n}</span>
      {kind === "image" ? (
        <Art src={url} className="size-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{kind === "audio" ? <FileAudio className="size-4" /> : <FileVideo className="size-4" />}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          Image {n} · {label}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{missing ? "not in the project folder yet" : isLocalRef(url) ? url.replace("local:", "") : url}</p>
        {note && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/80">{note}</p>}
      </div>
      {kind === "audio" && resolved && (
        <audio src={resolved} controls preload="none" className="h-8 w-40 shrink-0" />
      )}
      {resolved && (
        <button
          type="button"
          onClick={() => (isLocalRef(url) ? downloadRef(url) : window.open(resolved, "_blank", "noopener"))}
          title={isLocalRef(url) ? "Save a copy" : "Open in a new tab"}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Download className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Result({ asset, folderPath }: { asset: AssetInfo; folderPath?: string }) {
  const sep = folderPath?.includes("/") && !folderPath?.includes("\\") ? "/" : "\\";
  const display = asset.fullPath || (folderPath ? `${folderPath.replace(/[\\/]+$/, "")}${sep}${asset.path.replace(/[\\/]+/g, sep)}` : asset.path);
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <Check className="size-3.5 text-success" />
      <span className="truncate font-mono" title={display}>{display}</span>
      {asset.duration !== undefined && <span className="shrink-0 tabular-nums">{asset.duration.toFixed(1)} s</span>}
      {asset.width ? (
        <span className="shrink-0 tabular-nums">
          {asset.width}×{asset.height}
        </span>
      ) : null}
      <span className="shrink-0">{Math.round(asset.size / 1024)} KB</span>
    </div>
  );
}

function Preview({ task, projectRoot }: { task: ManualTask; projectRoot: string }) {
  const asset = task.asset!;
  const ref = `local:${projectRoot}/${asset.path}`;
  const url = useMediaUrl(ref);
  const isVertical = (asset.height ?? 0) > (asset.width ?? 0);
  if (task.kind === "image") {
    return (
      <Art
        src={ref}
        className={cn(
          "rounded-xl object-contain bg-black/40",
          isVertical ? "aspect-[9/16] max-h-96 mx-auto" : "aspect-video w-full object-cover",
        )}
      />
    );
  }
  if (task.kind === "audio") return url ? <audio src={url} controls className="w-full" /> : null;
  return url ? (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      className={cn(
        "rounded-xl bg-black",
        isVertical ? "aspect-[9/16] max-h-96 mx-auto" : "aspect-video w-full",
      )}
    />
  ) : null;
}

type Actions = {
  onSubmit: (raw: string) => Promise<string[] | void>;
  onSkip?: () => Promise<void>;
  onFile: (file: File) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onClear: () => Promise<void>;
  onLine?: (text: string) => Promise<void>;
  onDemote?: () => Promise<void>;
  onScene?: (scene: string) => Promise<void>;
  onPlain?: (on: boolean) => Promise<void>;
  onConfirm?: () => Promise<void>;
};

export function TaskCard({ task, actions, projectRoot, folderPath }: { task: ManualTask; actions: Actions; projectRoot: string; folderPath?: string }) {
  const [paste, setPaste] = useState(() => task.kind === "srt" ? (task.currentJson ?? "") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [line, setLine] = useState(task.prompt);
  const [scene, setScene] = useState("");
  const [editingJson, setEditingJson] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setLine(task.prompt), [task.prompt]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const Icon = task.kind === "json" || task.kind === "srt" ? Sparkles : task.kind === "image" ? ImageIcon : task.kind === "audio" ? Volume2 : FileVideo;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className={cn("flex flex-col gap-3 rounded-2xl border p-3.5", task.done ? "border-border bg-card/30" : "border-border-strong bg-card/60")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", task.done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
            {task.done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
              {task.title}
              {task.optional && <span className="rounded-full border border-border px-1.5 text-[10px] font-normal text-muted-foreground">optional</span>}
            </p>
            {task.hint ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{task.hint}</p> : null}
          </div>
        </div>
        {task.done && (
          <div className="flex items-center gap-1.5">
            {actions.onRefresh && (
              <button
                type="button"
                onClick={() => run(actions.onRefresh!)}
                disabled={busy}
                title="Re-read the expected file from the folder"
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground"
              >
                <RefreshCw className={cn("size-3", busy && "animate-spin")} /> Refresh
              </button>
            )}
            <button
              type="button"
              onClick={() => run(actions.onClear)}
              disabled={busy}
              title="Do this step again"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground"
            >
              <RotateCcw className="size-3" /> Redo
            </button>
          </div>
        )}
      </div>

      {task.warn && (
        <p className="flex items-start gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11.5px] text-accent">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>{task.warn}</span>
        </p>
      )}

      {!task.done && (
        <>
          {task.prompt && (
            <Field
              title={
                task.promptPlaceholders?.length
                  ? `${promptLabel(task)} · ⚠ contains placeholders (see below)`
                  : promptLabel(task)
              }
              body={task.prompt}
            />
          )}
          {task.promptPlaceholders?.length ? (
            <div className="flex flex-col gap-1 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[11.5px]">
              <p className="font-medium text-accent">Replace before sending:</p>
              {task.promptPlaceholders.map((p) => (
                <p key={p} className="text-muted-foreground">· {p}</p>
              ))}
            </div>
          ) : null}
          {!task.veo && task.params && (
            <Field
              title="Parameters"
              body={Object.entries(task.params)
                .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                .join("\n")}
            />
          )}
          {task.shape && <Field title="Answer shape" body={task.shape} />}
          {task.refs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Reference files · in this order
              </p>
              {task.refs.map((r) => (
                <RefRow key={`${r.n}-${r.url}`} {...r} />
              ))}
            </div>
          )}
          {task.want && (task.want.seconds || task.want.range || task.want.size || task.want.note) && (
            <p className="text-[11.5px] text-muted-foreground">
              Wanted:{" "}
              {[
                task.want.seconds ? `${task.want.seconds} s` : "",
                task.want.range ? `${task.want.range[0]}–${task.want.range[1]} s` : "",
                task.want.size ? `${task.want.size.width}×${task.want.size.height}` : "",
                task.want.note ?? "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </>
      )}

      {task.done && task.asset && task.kind !== "srt" && (
        <div className="flex flex-col gap-2">
          <Preview task={task} projectRoot={projectRoot} />
          <Result asset={task.asset} folderPath={folderPath} />
        </div>
      )}

      {task.done && task.asset && task.kind === "srt" && (
        <div className="flex items-center gap-2">
          <Result asset={task.asset} folderPath={folderPath} />
          <button
            type="button"
            onClick={() => downloadRef(`local:${projectRoot}/${task.asset!.path}`)}
            title="Download subtitles.srt"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground"
          >
            <Download className="size-3" /> Download SRT
          </button>
        </div>
      )}

      {actions.onConfirm && task.done && task.warn && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(actions.onConfirm!)}>
          <Check className="size-3.5" /> Looks good — clear this warning
        </Button>
      )}

      {/* taking the answer or global editing */}
      {task.done && task.kind === "json" && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <FileText className="size-3.5 text-primary" />
              {editingJson ? "Update script globally" : "Current script JSON"}
            </span>
            <div className="flex items-center gap-2">
              {task.currentJson && <CopyButton text={task.currentJson} label="Copy JSON" />}
              <Button
                size="sm"
                variant={editingJson ? "ghost" : "secondary"}
                onClick={() => {
                  if (!editingJson) setPaste(task.currentJson ?? "");
                  setEditingJson((e) => !e);
                }}
              >
                <Edit className="size-3" />
                {editingJson ? "Cancel" : "Update script"}
              </Button>
            </div>
          </div>
          {editingJson ? (
            <div className="flex flex-col gap-2 mt-1">
              <p className="text-[11px] text-muted-foreground">
                Edit the script JSON or paste an updated script. Downstream blocks and shot specifications will sync globally.
              </p>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={10}
                className="w-full resize-y rounded-xl border border-border bg-background/80 px-3 py-2 font-mono text-[11.5px] outline-none focus:border-border-strong"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={busy || !paste.trim()}
                  onClick={() =>
                    run(async () => {
                      const w = await actions.onSubmit(paste);
                      setNotes(Array.isArray(w) ? w : []);
                      setEditingJson(false);
                    })
                  }
                >
                  <Check className="size-3.5" /> Save global update
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingJson(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : task.currentJson ? (
            <pre className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-black/30 p-2 font-mono text-[10.5px] text-muted-foreground whitespace-pre-wrap">
              {task.currentJson}
            </pre>
          ) : null}
        </div>
      )}

      {!task.done && (task.kind === "json" || task.kind === "srt") && (
        <div className="flex flex-col gap-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={task.kind === "srt" ? "Paste the SRT output from your vision tool here." : "Paste the whole answer here. Prose or a ```json fence around it is fine."}
            rows={task.kind === "srt" ? 8 : 4}
            className="w-full resize-y rounded-xl border border-border bg-background/70 px-3 py-2 font-mono text-[11.5px] outline-none placeholder:text-muted-foreground focus:border-border-strong"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy || !paste.trim()}
              onClick={() =>
                run(async () => {
                  const w = await actions.onSubmit(paste);
                  setNotes(Array.isArray(w) ? w : []);
                  setPaste("");
                })
              }
            >
              <Clipboard className="size-3.5" /> {task.kind === "srt" ? "Use this SRT" : "Use this answer"}
            </Button>
            {actions.onSkip && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(actions.onSkip!)}>
                <SkipForward className="size-3.5" /> Skip this step
              </Button>
            )}
          </div>
        </div>
      )}

      {!task.done && task.slot && !task.render && task.kind !== "srt" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) run(() => actions.onFile(f));
          }}
          className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-2.5 transition-colors", drag ? "border-primary bg-primary/5" : "border-border-strong bg-background/30")}
        >
          <p className="min-w-0 text-[11.5px] text-muted-foreground">
            Save it as <code className="font-mono text-foreground/80">{task.slot.base}</code> in <code className="font-mono text-foreground/80">{folderPath ? (task.slot.dir ? `${folderPath.replace(/[\\/]+$/, "")}${folderPath.includes("/") && !folderPath.includes("\\") ? "/" : "\\"}${task.slot.dir.replace(/[\\/]+/g, folderPath.includes("/") && !folderPath.includes("\\") ? "/" : "\\")}` : folderPath) : (task.slot.dir ? `${task.slot.dir}/` : "./")}</code> and it is picked up on its own, or drop it here.
          </p>
          <div className="flex items-center gap-2">
            {actions.onRefresh && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(actions.onRefresh!)}>
                <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> Refresh
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => file.current?.click()}>
              <Upload className="size-3.5" /> Choose the file
            </Button>
          </div>
          <input
            ref={file}
            type="file"
            hidden
            accept={task.slot.exts.map((e) => `.${e}`).join(",")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run(() => actions.onFile(f));
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* the iterative escape hatches */}
      {actions.onLine && (
        <Fold title="The line is the wrong length: rewrite it">
          <textarea
            value={line}
            onChange={(e) => setLine(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-xl border border-border bg-background/70 px-3 py-2 text-[12px] outline-none focus:border-border-strong"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy || !line.trim() || line === task.prompt} onClick={() => run(() => actions.onLine!(line))}>
              Use this line and record again
            </Button>
            {actions.onDemote && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(actions.onDemote!)}>
                Make it a voice-over instead
              </Button>
            )}
          </div>
        </Fold>
      )}

      {actions.onScene && (
        <Fold title="A filter refused the scene, or the frame came out wrong">
          <textarea
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            placeholder="Paste the rewritten scene here"
            rows={3}
            className="w-full resize-y rounded-xl border border-border bg-background/70 px-3 py-2 text-[12px] outline-none focus:border-border-strong"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy || !scene.trim()} onClick={() => run(() => actions.onScene!(scene))}>
              Use this scene
            </Button>
            {actions.onPlain && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => actions.onPlain!(true))}>
                Paint it without the narrator
              </Button>
            )}
          </div>
        </Fold>
      )}

      {task.helpers?.length ? (
        <Fold title={`Helpers (${task.helpers.length})`}>
          {task.helpers.map((h) => (
            <div key={h.title} className="flex flex-col gap-1.5 rounded-xl border border-border bg-background/60 p-2.5">
              <p className="text-xs font-medium">{h.title}</p>
              <p className="text-[11px] text-muted-foreground">{h.note}</p>
              {h.model && <code className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">{h.model}</code>}
              {h.prompt && <Field title="Prompt" body={h.prompt} />}
              {h.promptPlaceholders?.length ? (
                <div className="flex flex-col gap-1 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[11.5px]">
                  <p className="font-medium text-accent">Replace before sending:</p>
                  {h.promptPlaceholders.map((p) => (
                    <p key={p} className="text-muted-foreground">· {p}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </Fold>
      ) : null}

      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[11.5px] text-accent">
          {notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">{error}</p>}
    </motion.div>
  );
}
