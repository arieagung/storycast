import { X, UserRound } from "lucide-react";
import { useState } from "react";
import { Drawer } from "@/components/motion/drawer";
import { CharacterPicker, type CharacterChoice } from "@/components/app/character-picker";
import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
import { cn } from "@/lib/utils";
import { type CastMember, type Config } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: Config;
  lang: string;
  /** ID of the character the project currently uses (for initial selection). */
  currentId: string;
  /** Name override the project currently uses. */
  currentName: string;
  onConfirm: (characterId: string, characterName: string) => Promise<void>;
};

export function CharacterSwapDialog({ open, onOpenChange, config, lang, currentId, currentName, onConfirm }: Props) {
  const [choice, setChoice] = useState<CharacterChoice>(() =>
    currentId ? { kind: "cast", id: currentId } : { kind: "new" },
  );
  const [name, setName] = useState(currentName);
  const [state, setState] = useState<ButtonState>("idle");

  const member = choice.kind === "cast" ? config.characters.find((c: CastMember) => c.id === choice.id) : undefined;

  async function confirm() {
    setState("loading");
    try {
      await onConfirm(member?.id ?? "", name.trim());
      setState("success");
      setTimeout(() => {
        setState("idle");
        onOpenChange(false);
      }, 800);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Change character"
      className="w-[min(560px,92vw)] max-w-none overflow-hidden"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-medium">Change character</p>
          <p className="text-[11px] text-muted-foreground">
            Replaces the narrator. Sheet, keyframes and shots will be regenerated.
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

      {/* Scrollable picker area */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <CharacterPicker
          cast={config.characters}
          groups={config.character_groups}
          lang={lang}
          value={choice}
          onChange={(v) => {
            setChoice(v);
            // Clear name override when switching away from a cast member
            if (v.kind !== "cast") setName("");
          }}
        />
      </div>

      {/* Footer: name input + confirm */}
      <div className="shrink-0 space-y-3 border-t border-border px-5 py-4">
        {/* Name input (visible for cast + new; upload not supported mid-project) */}
        {choice.kind !== "upload" && (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-3 py-2">
            <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={member ? `${member.name} (rename optional)` : "Name your character (optional)"}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {name && (
              <button
                type="button"
                onClick={() => setName("")}
                aria-label="Clear name"
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}

        {choice.kind === "upload" && (
          <p className={cn("text-[11px] text-muted-foreground")}>
            Uploading a custom character mid-project is not supported. Choose a preset or "Invent one" instead.
          </p>
        )}

        <StatefulButton
          size="lg"
          state={state}
          onClick={confirm}
          disabled={choice.kind === "upload"}
          loadingText="Switching…"
          successText="Done"
          className="w-full"
          icon={<UserRound className="size-4" />}
        >
          {member
            ? `Switch to ${name.trim() || member.name}`
            : name.trim()
              ? `Invent "${name.trim()}"`
              : "Invent a new character"}
        </StatefulButton>
      </div>
    </Drawer>
  );
}
