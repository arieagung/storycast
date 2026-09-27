import { useCallback, useEffect, useState } from "react";
import { CreateForm } from "@/components/app/create-form";
import { FilmsPage } from "@/components/app/films-page";
import { WatchPage } from "@/components/app/watch-page";
import { Gallery } from "@/components/app/gallery";
import { Header } from "@/components/app/header";
import { Hero } from "@/components/app/hero";
import { StudioPanel } from "@/components/app/studio-panel";
import { ProjectRow } from "@/components/app/project-row";
import { AnimatedToastStack, useAnimatedToastStack } from "@/components/motion/animated-toast-stack";
import { community } from "@/lib/share";
import { api, type Config, type Film, type Job, type NewJob } from "@/lib/api";
import { navigate, usePath } from "@/lib/router";

const JOB_KEY = "storycast-job";

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(JOB_KEY, id);
    else localStorage.removeItem(JOB_KEY);
  } catch {}
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [films, setFilms] = useState<Film[]>([]);
  const [filmsLoading, setFilmsLoading] = useState(true);
  const [shared, setShared] = useState<Film[]>([]);
  const [projects, setProjects] = useState<Job[]>([]);
  const path = usePath();
  const [current, setCurrent] = useState<string | null>(null);
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({ limit: 3 });

  const loadFilms = useCallback(
    () =>
      Promise.all([
        api.films().then(setFilms).catch(() => {}),
        api.projects().then(setProjects).catch(() => {}),
        community()
          .then((list) => setShared(list.map((f) => ({ ...f, community: true }))))
          .catch(() => {}),
      ]).finally(() => setFilmsLoading(false)),
    [],
  );
  const everything = [...films, ...shared];

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch(() => showToast({ status: "error", title: "Could not load the studio data" }));
    loadFilms();
    try {
      setCurrent(localStorage.getItem(JOB_KEY));
    } catch {}
  }, [loadFilms, showToast]);

  // /create/<id> opens that film's workbench.
  useEffect(() => {
    if (!path.startsWith("/create/")) return;
    const id = decodeURIComponent(path.slice("/create/".length));
    if (id) {
      setCurrent(id);
      remember(id);
    }
  }, [path]);

  const open = useCallback((id: string) => {
    setCurrent(id);
    remember(id);
    navigate(`/create/${id}`);
    requestAnimationFrame(() => document.getElementById("production")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  async function start(body: NewJob) {
    const rec = await api.create(body);
    await loadFilms();
    open(rec.id);
    showToast({
      status: "success",
      title: "Project started",
      description: `Everything for this film goes in the folder ${rec.project}`,
      duration: 7000,
    });
  }

  async function discard(id: string) {
    await api.discard(id);
    if (current === id) {
      setCurrent(null);
      remember(null);
    }
    await loadFilms();
    showToast({ status: "success", title: "Project removed from this browser", description: "The files in your folder are untouched.", duration: 5000 });
  }

  const production = current ? (
    <div id="production" className="scroll-mt-24">
      <StudioPanel id={current} onChanged={loadFilms} />
    </div>
  ) : null;

  return (
    <div className="min-h-dvh">
      <Header onFolder={() => navigate("/create")} />
      <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 pb-24 sm:px-6">
        {path.startsWith("/films/") ? (
          <WatchPage id={decodeURIComponent(path.slice("/films/".length))} films={everything} cast={config?.characters ?? []} loading={filmsLoading} />
        ) : path.startsWith("/films") ? (
          <FilmsPage films={everything} loading={filmsLoading} cast={config?.characters ?? []} />
        ) : path.startsWith("/create") ? (
          <div className="flex flex-col gap-6 pt-8">
            <ProjectRow projects={projects} current={current} onOpen={open} onDiscard={discard} onNew={() => (setCurrent(null), remember(null), navigate("/create"))} />
            {production}
            {!current &&
              (config ? (
                <CreateForm config={config} onStart={start} onError={(message) => showToast({ status: "error", title: message })} />
              ) : (
                <div className="h-96 animate-pulse rounded-3xl border border-border bg-card/40" />
              ))}
          </div>
        ) : (
          <>
            <Hero cast={config?.characters ?? []} films={films} />
            <Gallery films={films} />
          </>
        )}
      </main>
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Storycast · every prompt, cut and subtitle is worked out here; the models are yours
      </footer>
      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="bottom-right" fixed portal />
    </div>
  );
}
