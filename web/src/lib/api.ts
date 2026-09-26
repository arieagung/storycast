import { assetRef, keepAsset, IMAGE_EXTS } from "@/lib/studio/assets";
import { studioData, seedFilms } from "@/lib/studio/data";
import { Studio } from "@/lib/studio/manual";
import { newRecord } from "@/lib/studio/pipeline";
import type { NarrativeId } from "@/lib/studio/director";
import { allRecords, deleteRecord, loadRecord, saveRecord, type FilmRecord } from "@/lib/studio/store";
import * as voices from "@/lib/studio/voices";

export type Style = { id: string; label: string; thumb: string; category: string; blurb: string };
export type Language = { code: string; name: string; native: string };
export type CastMember = {
  id: string;
  name: string;
  personality: string;
  group: string;
  style: string;
  style_label: string;
  thumb: string;
  hero: string;
  sheet: string;
  voice: { voice_id: string; name: string };
};
export type Config = {
  styles: Style[];
  categories: string[];
  characters: CastMember[];
  character_groups: string[];
  languages: Language[];
  max_minutes: number;
};

export type PlanBlock = { kind: "V" | "T"; text: string };
export type Plan = { title: string; subtitle: string; character: { name: string }; blocks: PlanBlock[] };

export type JobEvent = { t: number; stage: string; msg: string };
export type JobResult = { title: string; duration: number; video: string; clean: string | null; poster: string | null };
export type JobStatus = "draft" | "working" | "done";
export type Job = {
  id: string;
  topic: string;
  style: string;
  style_label: string;
  minutes: number;
  lang: string;
  status: JobStatus;
  stage: string;
  title: string;
  result: JobResult | null;
  created: number;
  project: string;
  events: JobEvent[];
};

export type Film = {
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  style: string;
  style_label: string;
  lang: string;
  minutes: number | null;
  duration: number;
  created: number;
  narrator: string;
  voice: string;
  video: string;
  clean: string | null;
  poster: string | null;
  thumb: string | null;
  keyframes: string[];
  script: string[];
  kinds: ("V" | "T")[];
  character_id: string;
  events: JobEvent[];
  mine?: boolean;
  community?: boolean;
  status?: "unlisted" | "pending" | "public" | "hidden";
  in_review?: boolean;
  views?: number;
};

export type NewJob = {
  topic: string;
  style: string;
  minutes: number;
  language: string;
  /** Your own illustration, kept in the film's folder as input/style.*. */
  styleFile: File | null;
  /** Your own character, kept in the film's folder as input/character.*. */
  characterFile: File | null;
  character_name: string;
  character_id: string;
  voice: Voice | null;
  /** When true, use Veo Mode: each shot is generated with embedded narration audio (no separate TTS step). */
  veo?: boolean;
  /** Storytelling style, chosen separately from the character. Defaults to "auto". */
  narrative?: NarrativeId;
  /** Free text used when narrative is "custom". */
  narrative_text?: string;
};

export type Voice = {
  voice_id: string;
  name: string;
  description: string;
  preview_url: string;
  category: string;
  tags: string[];
  languages?: string[];
  short?: string;
  gender: string;
  age: string;
  accent: string;
  collections: number;
  curated: boolean;
};
export type VoicePage = { voices: Voice[]; has_more: boolean; total_count: number };
export type VoiceFacets = {
  total: number;
  gender: string[];
  age: string[];
  accent: string[];
  category: string[];
  tags: { tag: string; count: number }[];
  languages: { language: string; count: number }[];
};
export type VoiceQuery = {
  search: string;
  gender: string;
  age: string;
  accent: string;
  category: string;
  language: string;
  sort: string;
  curated: boolean;
  tags: string[];
};

const toFilm = (d: FilmRecord): Film | null => {
  const r = d.result || {};
  if (d.status !== "done" || !r.video) return null;
  const a = d.assets || {};
  return {
    id: d.id,
    title: d.title || "",
    subtitle: d.subtitle || "",
    topic: d.topic || "",
    style: d.style || "",
    style_label: d.style_label || d.style || "",
    lang: d.lang || "en",
    minutes: d.minutes ?? null,
    duration: r.duration || 0,
    created: d.created || 0,
    narrator: d.narrator?.name || "",
    voice: d.voice?.name || "",
    video: r.video,
    clean: r.clean ?? null,
    poster: r.poster ?? null,
    thumb: d.thumb ?? null,
    keyframes: Object.values(a.keyframes || {}).filter(Boolean) as string[],
    script: (d.blocks || []).map((b: PlanBlock) => b.text),
    kinds: (d.blocks || []).map((b: PlanBlock) => b.kind),
    character_id: d.character_id || "",
    events: (d.events || [])
      .filter((e: JobEvent) => e.stage !== "queued" && e.stage !== "error")
      .slice(0, 40)
      .map((e: JobEvent) => ({ t: e.t, stage: e.stage, msg: e.msg })),
  };
};

export function toJob(d: FilmRecord): Job {
  return {
    id: d.id,
    topic: d.topic,
    style: d.style,
    style_label: d.style_label || d.style,
    minutes: d.minutes,
    lang: d.lang,
    status: (d.status === "done" ? "done" : d.status === "draft" ? "draft" : "working") as JobStatus,
    stage: d.stage,
    title: `${d.title || ""} ${d.subtitle || ""}`.trim(),
    result: d.status === "done" ? d.result : null,
    created: d.created,
    project: d.project || "",
    events: [...(d.events || [])],
  };
}

const ext = (file: File) => (file.name.split(".").pop() || "").toLowerCase();

async function keepInput(project: string, kind: "style" | "character", file: File) {
  if (!IMAGE_EXTS.includes(ext(file))) throw new Error("png / jpg / webp only");
  if (file.size > 20 * 1024 * 1024) throw new Error("image is larger than 20 MB");
  const path = `input/${kind}.${ext(file)}`;
  await keepAsset(`${project}/${path}`, file);
  return assetRef(project, path);
}

export const api = {
  config: async (): Promise<Config> => {
    const d = await studioData();
    return d;
  },
  films: async (): Promise<Film[]> => {
    const [seeds, mine] = await Promise.all([seedFilms(), allRecords().catch(() => [] as FilmRecord[])]);
    const byId = new Map<string, Film>();
    const seedIds = new Set(seeds.map((d: FilmRecord) => d.id));
    for (const d of [...seeds, ...mine]) {
      const f = toFilm(d);
      if (f) byId.set(f.id, { ...f, mine: !seedIds.has(f.id) });
    }
    return [...byId.values()].sort((a, b) => b.created - a.created);
  },
  /** Every film of yours, finished or not, so the workbench can be picked up again. */
  projects: async (): Promise<Job[]> => (await allRecords().catch(() => [] as FilmRecord[])).map(toJob).sort((a, b) => b.created - a.created),
  job: async (id: string) => {
    const d = await loadRecord(id);
    if (!d) throw new Error("film not found");
    return d;
  },
  open: async (id: string) => {
    const d = await loadRecord(id);
    if (!d) throw new Error("film not found");
    return Studio.open(d);
  },
  discard: (id: string) => deleteRecord(id),

  create: async (body: NewJob): Promise<FilmRecord> => {
    const d = await studioData();
    if (!body.topic.trim()) throw new Error("topic is empty");
    let style = body.style;
    if (body.character_id) {
      const c = d.characters.find((x) => x.id === body.character_id);
      if (!c) throw new Error("unknown character");
      style = c.style;
    }
    const known = d.styles.some((s) => s.id === style) || (style === "custom" && body.styleFile);
    if (!known || !d.languages.some((l) => l.code === body.language) || body.minutes < 1 || body.minutes > d.max_minutes)
      throw new Error("bad style / language / minutes");
    const v = body.voice;
    const rec = newRecord({
      topic: body.topic.trim(),
      style,
      minutes: body.minutes,
      lang: body.language,
      style_url: "",
      character_url: "",
      character_name: body.character_name.trim(),
      character_id: body.character_id,
      voice: v?.voice_id ? { voice_id: v.voice_id, name: v.name, gender: v.gender, age: v.age, accent: v.accent, description: v.description } : {},
      narrative: body.narrative ?? "auto",
      narrative_text: body.narrative === "custom" ? (body.narrative_text ?? "").trim() : "",
    });
    if (!body.character_id && style === "custom" && body.styleFile) rec.style_url = await keepInput(rec.project, "style", body.styleFile);
    if (!body.character_id && body.characterFile) rec.character_url = await keepInput(rec.project, "character", body.characterFile);
    if (body.veo) rec.veo = true;
    rec.events.push({ t: 0, stage: "script", msg: `Project folder: ${rec.project}` });
    await saveRecord(rec);
    return rec;
  },

  voiceFacets: () => voices.facets(),
  voices: (q: VoiceQuery, page: number, signal?: AbortSignal) => voices.search(q, page, signal),
  curatedVoices: () => voices.curated(),
  sample: (voice_id: string, topic: string, language: string) => voices.audition(voice_id, topic, language),
  characterVoice: (id: string, language: string) => voices.characterIntro(id, language),
  preview: (v: Voice, language: string) => voices.preview(v, language),
};

export const STAGES = [
  ["read", "Your images"],
  ["script", "Script"],
  ["character", "Character"],
  ["voice", "Narration"],
  ["keyframes", "Keyframes"],
  ["shots", "Shots"],
  ["music", "Score"],
  ["endcard", "End card"],
  ["edit", "Edit"],
] as const;

export function clock(t: number) {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

const displayNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "language" }) : null;

export function nativeLanguage(code: string) {
  try {
    const n = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
    return n.charAt(0).toLocaleUpperCase(code) + n.slice(1);
  } catch {
    return code;
  }
}

export function languageName(code: string) {
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}
