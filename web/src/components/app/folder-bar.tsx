import { FolderOpen, FolderSync, HardDriveDownload, RefreshCw, Unlink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/motion/button/base";
import { grantFolder, pickFolder, unbindFolder, useFolder } from "@/lib/studio/assets";
import { cn } from "@/lib/utils";

/**
 * Binding a folder is the one thing a browser cannot do for you: it needs a
 * click before it may read from disk. After that, every file you save under
 * the name a step asks for is found and measured on its own.
 */
export function FolderBar({ project, onSync, syncing, className }: { project?: string; onSync?: () => void; syncing?: boolean; className?: string }) {
  const { state, name, supported } = useFolder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/abort/i.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", state === "ok" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
          <FolderOpen className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {state === "ok" ? (
            <>
              <p className="truncate text-sm font-medium">
                {name}
                {project ? <span className="text-muted-foreground"> / {project}</span> : null}
              </p>
              <p className="text-[11px] text-muted-foreground">Files you save here are picked up and measured on their own.</p>
            </>
          ) : state === "ask" ? (
            <>
              <p className="text-sm font-medium">Your folder needs permission again</p>
              <p className="text-[11px] text-muted-foreground">Browsers forget folder access between visits. One click brings it back.</p>
            </>
          ) : state === "unsupported" ? (
            <>
              <p className="text-sm font-medium">This browser cannot open a folder</p>
              <p className="text-[11px] text-muted-foreground">Drop each file onto its step instead; the app keeps a copy itself. Edge and Chrome can bind a folder. In Brave, enable <em>File editing</em> under Site permissions (Shields blocks it by default).</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Choose a working folder</p>
              <p className="text-[11px] text-muted-foreground">Everything you make lands here, in a folder per film. Without one the app holds the files itself, which is easier to lose.</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {state === "ok" && onSync && (
            <Button size="sm" variant="secondary" disabled={busy || syncing} onClick={onSync}>
              <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} /> {syncing ? "Looking…" : "Look for new files"}
            </Button>
          )}
          {state === "ask" && (
            <Button size="sm" disabled={busy} onClick={() => act(grantFolder)}>
              <FolderSync className="size-3.5" /> Allow again
            </Button>
          )}
          {(state === "none" || state === "ask") && supported && (
            <Button size="sm" variant={state === "ask" ? "secondary" : "primary"} disabled={busy} onClick={() => act(pickFolder)}>
              <HardDriveDownload className="size-3.5" /> {state === "ask" ? "Pick another" : "Choose folder"}
            </Button>
          )}
          {state === "ok" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(unbindFolder)} title="Stop using this folder">
              <Unlink className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}
