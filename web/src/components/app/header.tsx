import { FolderOpen } from "lucide-react";
import { SharedLayoutBg } from "@/components/motion/shared-layout-bg";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { Link, usePath } from "@/lib/router";
import { useFolder } from "@/lib/studio/assets";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/create", label: "Create" },
  { to: "/films", label: "Explore" },
];

/** Shows whether a working folder is bound, because everything you make lands there. */
function FolderButton({ onFolder }: { onFolder?: () => void }) {
  const { state, name } = useFolder();
  const ok = state === "ok";
  return (
    <button
      type="button"
      onClick={onFolder}
      title={ok ? `Working folder: ${name}` : "Choose a working folder on the Create page"}
      className={cn(
        "ml-1 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors sm:ml-2",
        ok ? "border-border text-muted-foreground hover:text-foreground" : "border-transparent bg-foreground font-medium text-background hover:opacity-90",
      )}
    >
      {ok ? <span className="size-1.5 rounded-full bg-success" /> : <FolderOpen className="size-3.5" />}
      <span className="hidden max-w-32 truncate sm:inline">{ok ? name : "Choose folder"}</span>
      <span className="sm:hidden">{ok ? "Folder" : "Folder"}</span>
    </button>
  );
}

export function Header({ onFolder }: { onFolder?: () => void }) {
  const path = usePath();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
        <Link to="/" aria-label="Storycast" className="flex shrink-0 items-center gap-2.5">
          <img src="/logo.svg" alt="" className="size-9" />
          <span className="hidden text-[17px] font-semibold tracking-tight sm:inline">Storycast</span>
        </Link>
        <nav className="flex items-center gap-1">
          <SharedLayoutBg className="w-auto flex-row items-center gap-1" pillClassName="rounded-full bg-muted" inset={0}>
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={(n.to === "/" ? path === "/" : path.startsWith(n.to)) ? "page" : undefined}
                className={cn(
                  "relative rounded-full px-2 py-1.5 text-sm transition-colors sm:px-3.5",
                  (n.to === "/" ? path === "/" : path.startsWith(n.to)) ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            ))}
          </SharedLayoutBg>
          <FolderButton onFolder={onFolder} />
          <ThemeToggle
            variant="circle-blur"
            className="ml-1 size-10 shrink-0 rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground sm:ml-2"
            iconClassName="size-4"
          />
        </nav>
      </div>
    </header>
  );
}
