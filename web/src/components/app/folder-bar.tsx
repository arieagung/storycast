import { Check, Edit, FolderOpen, FolderSync, HardDriveDownload, RefreshCw, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/motion/button/base";
import { grantFolder, pickFolder, unbindFolder, useFolder } from "@/lib/studio/assets";
import { cn } from "@/lib/utils";

/**
 * Binding a folder is the one thing a browser cannot do for you: it needs a
 * click before it may read from disk. After that, every file you save under
 * the name a step asks for is found and measured on its own.
 */
export function FolderBar({
  project,
  folderPath,
  onSetFolderPath,
  onSync,
  syncing,
  className,
}: {
  project?: string;
  folderPath?: string;
  onSetFolderPath?: (path: string) => Promise<void> | void;
  onSync?: () => void;
  syncing?: boolean;
  className?: string;
}) {
  const { state, name, supported } = useFolder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingPath, setEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState(folderPath ?? "");

  useEffect(() => {
    setPathInput(folderPath ?? "");
  }, [folderPath]);

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
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", state === "ok" || folderPath ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
          <FolderOpen className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {editingPath ? (
            <div className="flex flex-col gap-1.5 py-0.5">
              <p className="text-xs font-medium">Set real folder path on disk:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  placeholder="e.g. D:\Onedrive\...\madu"
                  className="w-full flex-1 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-xs font-mono outline-none focus:border-border-strong"
                />
                <Button
                  size="sm"
                  disabled={busy || !pathInput.trim()}
                  onClick={async () => {
                    if (onSetFolderPath) await onSetFolderPath(pathInput.trim());
                    setEditingPath(false);
                  }}
                >
                  <Check className="size-3.5" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingPath(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : folderPath ? (
            <>
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium font-mono text-foreground" title={folderPath}>
                  {folderPath}
                </p>
                {onSetFolderPath && (
                  <button
                    type="button"
                    onClick={() => {
                      setPathInput(folderPath);
                      setEditingPath(true);
                    }}
                    title="Change folder path"
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Edit className="size-3" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Files are read from and written directly to this folder.</p>
            </>
          ) : state === "ok" ? (
            <>
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">
                  {name}
                  {project ? <span className="text-muted-foreground"> / {project}</span> : null}
                </p>
                {onSetFolderPath && (
                  <button
                    type="button"
                    onClick={() => {
                      setPathInput(name);
                      setEditingPath(true);
                    }}
                    title="Set full Windows path"
                    className="text-[11px] text-primary underline hover:text-primary/80"
                  >
                    Set path
                  </button>
                )}
              </div>
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
              <p className="text-[11px] text-muted-foreground">Drop each file onto its step instead; the app keeps a copy itself. Edge and Chrome can bind a folder. In Brave, enable <em>File System Access API</em> in <code>brave://flags</code> (disabled by default).</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Choose a working folder</p>
                {onSetFolderPath && (
                  <button
                    type="button"
                    onClick={() => {
                      setPathInput("");
                      setEditingPath(true);
                    }}
                    title="Set full Windows path"
                    className="text-[11px] text-primary underline hover:text-primary/80"
                  >
                    or enter path
                  </button>
                )}
              </div>
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
