import { AlertTriangle, Check, Copy, FileText, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Drawer } from "@/components/motion/drawer";
import { Button } from "@/components/motion/button/base";
import type { Plan } from "@/lib/studio/director";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan;
  onConfirm: (raw: string) => Promise<string[] | void>;
};

function ScriptEditorContent({ onOpenChange, plan, onConfirm }: Omit<Props, "open">) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(plan, null, 2));
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON syntax");
    }
  };

  const handleApply = async () => {
    setBusy(true);
    setError("");
    setNotes([]);
    try {
      // Validate that it parses as JSON first
      JSON.parse(jsonText);
      const warnings = await onConfirm(jsonText);
      if (Array.isArray(warnings) && warnings.length > 0) {
        setNotes(warnings);
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <p className="text-sm font-medium">Script Editor (Global Update)</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Update the initial generated script. Downstream blocks and shot specifications will sync automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {plan.blocks.length} blocks · Narrator: <strong className="text-foreground">{plan.character.name}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={formatJson}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground"
            >
              <Sparkles className="size-3" /> Format JSON
            </button>
            <button
              type="button"
              onClick={copyJson}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy JSON"}
            </button>
          </div>
        </div>

        <textarea
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            if (error) setError("");
          }}
          rows={18}
          className="w-full flex-1 resize-y rounded-xl border border-border bg-background/80 p-3 font-mono text-[11.5px] leading-relaxed outline-none focus:border-border-strong"
          placeholder="Paste or edit the plan JSON..."
        />

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {notes.length > 0 && (
          <div className="flex flex-col gap-1 rounded-xl border border-accent/40 bg-accent/10 p-2.5 text-xs text-accent">
            <p className="font-medium">Warnings:</p>
            {notes.map((n, i) => (
              <p key={i}>· {n}</p>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3 bg-card/30">
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy || !jsonText.trim()} onClick={handleApply}>
          <Check className="size-3.5" /> {busy ? "Updating..." : "Apply Global Update"}
        </Button>
      </div>
    </>
  );
}

export function ScriptEditorDialog({ open, onOpenChange, plan, onConfirm }: Props) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Global Script Editor"
      className="w-[min(700px,94vw)] max-w-none overflow-hidden"
    >
      {open && <ScriptEditorContent onOpenChange={onOpenChange} plan={plan} onConfirm={onConfirm} />}
    </Drawer>
  );
}
