import {
  AUDIO_EXTS,
  IMAGE_EXTS,
  VIDEO_EXTS,
  assetRef,
  ensureDir,
  extsFor,
  findAsset,
  folderBound,
  join,
  keepAsset,
  kindOfName,
  measure,
  slotPath,
  writeText,
  type AssetInfo,
  type AssetSlot,
  type MediaKind,
} from "./assets";
import { studioData, type CastFull, type StudioData, type StyleFull } from "./data";
import * as D from "./director";
import type { Given, GivenVoice, Plan } from "./director";
import * as P from "./pipeline";
import { bash, powershell, renderKit, type RenderKit } from "./render";
import { saveRecord, type FilmRecord } from "./store";

/* ------------------------------------------------------------------ *\
   A step you do yourself

   Every task carries everything needed to reproduce, by hand, one call
   the original pipeline made to fal: the endpoint it was written for,
   the system prompt, the prompt, the non-prompt parameters, the
   reference images in the order the prompt talks about them, and the
   file name the answer has to be saved under.
\* ------------------------------------------------------------------ */

export type TaskKind = "json" | "image" | "audio" | "video";
export type StageKey = "read" | "script" | "character" | "voice" | "keyframes" | "shots" | "music" | "endcard" | "edit";

export type TaskRef = { n: number; label: string; url: string; kind: MediaKind; note?: string };
export type TaskHelper = { title: string; note: string; model?: string; prompt: string; promptPlaceholders?: string[] };

export type ManualTask = {
  key: string;
  stage: StageKey;
  kind: TaskKind;
  title: string;
  hint: string;
  /** The fal endpoint this step replaces. */
  model: string;
  modelNote?: string;
  /**
   * The full prompt to use, system and user combined.
   * For JSON steps this is "SYSTEM\n\n---\n\nUSER PROMPT".
   * For image/audio/video steps it is the user prompt only (no system).
   * Placeholders like {SCENE} or {TEXT} are noted in promptLabel.
   */
  prompt: string;
  /** When the prompt contains placeholders that need manual replacement, lists them. */
  promptPlaceholders?: string[];
  params?: Record<string, unknown>;
  refs: TaskRef[];
  slot?: AssetSlot;
  asset?: AssetInfo;
  want?: { seconds?: number; range?: [number, number]; size?: { width: number; height: number }; note?: string };
  shape?: string;
  helpers?: TaskHelper[];
  optional?: true;
  /** The edit step is not a model call; the UI shows the render kit instead. */
  render?: true;
  /** Narration tasks carry the block so its line can be rewritten in place. */
  block?: { id: string; kind: "V" | "T" };
  /** Keyframe and shot tasks carry the shot name so the scene can be rewritten. */
  shot?: string;
  /** Shot tasks only: true when this shot's own sound is dropped from the mix. */
  muted?: boolean;
  done: boolean;
  warn?: string;
};

export type Stage = {
  key: StageKey;
  label: string;
  note: string;
  state: "locked" | "open" | "done";
  locked?: string;
  tasks: ManualTask[];
  done: number;
  total: number;
};

const STAGE_NOTES: Record<StageKey, [string, string]> = {
  read: ["Your images", "Turn what you uploaded into words the other steps can use"],
  script: ["Script", "The director writes the film, the script editor smooths it"],
  character: ["Character", "A model sheet and a hero portrait, the two references every frame leans on"],
  voice: ["Narration", "One recording per block; their lengths decide the whole cut"],
  keyframes: ["Keyframes", "The opening frame of every shot"],
  shots: ["Shots", "Keyframes become moving shots; talking blocks are lip-synced"],
  music: ["Score", "One instrumental bed for the whole film"],
  endcard: ["End card", "The last keyframe, hand-lettered with the title"],
  edit: ["Edit", "The cut, the mix and the subtitles, as one ffmpeg script you run"],
};

/* ------------------------------------------------------------------ *\
   Where files live
\* ------------------------------------------------------------------ */

/** Joins system prompt and user prompt into one block, separated by a clear divider. */
const joined = (system: string, user: string) => `${system}\n\n---\n\n${user}`;

export const SLOTS = {
  style: { dir: "input", base: "style", exts: IMAGE_EXTS },
  character: { dir: "input", base: "character", exts: IMAGE_EXTS },
  sheet: { dir: "character", base: "sheet", exts: IMAGE_EXTS },
  hero: { dir: "character", base: "hero", exts: IMAGE_EXTS },
  music: { dir: "music", base: "score", exts: AUDIO_EXTS },
  card: { dir: "endcard", base: "card", exts: IMAGE_EXTS },
  film: { dir: "", base: "film", exts: VIDEO_EXTS },
  clean: { dir: "", base: "clean", exts: VIDEO_EXTS },
} satisfies Record<string, AssetSlot>;

export const narrationSlot = (id: string): AssetSlot => ({ dir: "narration", base: id, exts: AUDIO_EXTS });
export const keySlot = (shot: string): AssetSlot => ({ dir: "keyframes", base: shot, exts: IMAGE_EXTS });
export const shotSlot = (shot: string): AssetSlot => ({ dir: "shots", base: shot, exts: VIDEO_EXTS });

const FOLDERS = ["input", "character", "narration", "keyframes", "shots", "music", "endcard", "build"];

/* ------------------------------------------------------------------ *\
   The engine
\* ------------------------------------------------------------------ */

export class Studio {
  rec: FilmRecord;
  st: P.State;
  data: StudioData;
  cast: CastFull | null;
  /** Undefined until a custom look has been described. */
  style?: StyleFull;
  styleRef = "";

  private constructor(rec: FilmRecord, data: StudioData) {
    this.rec = rec;
    this.data = data;
    this.st = (rec.state ??= {}) as P.State;
    this.cast = rec.character_id ? (data.characters.find((c) => c.id === rec.character_id) ?? null) : null;
    if (this.cast) rec.style = this.cast.style;
    const preset = data.styles.find((s) => s.id === rec.style);
    this.style = rec.style === "custom" ? this.st.style : (this.st.style = preset);
    this.styleRef = rec.style_url || preset?.ref || "";
    rec.style_label = this.style?.label ?? rec.style;
  }

  static async open(rec: FilmRecord) {
    return new Studio(rec, await studioData());
  }

  get project() {
    return String(this.rec.project);
  }
  private full(path: string) {
    return join(this.project, path);
  }
  private ref(info?: AssetInfo) {
    return info ? assetRef(this.project, info.path) : "";
  }

  /** Creates the folders so you can drop files in before the app asks for them. */
  async prepare() {
    if (!folderBound()) return;
    for (const dir of FOLDERS) await ensureDir(this.full(dir));
  }

  /* --- references the prompts talk about -------------------------- */

  get sheetRef() {
    return this.cast?.sheet || this.ref(this.st.sheet);
  }
  get heroRef() {
    return this.cast?.hero || this.ref(this.st.hero);
  }
  get plan(): Plan | undefined {
    return this.st.plan;
  }
  get specs(): P.Spec[] {
    return this.st.specs ?? [];
  }
  specOf(shot: string) {
    return this.specs.find((s) => s.shot === shot);
  }
  blockOf(id: string) {
    return this.plan?.blocks.find((b) => b.id === id);
  }
  keyRef(shot: string) {
    return this.ref(this.specOf(shot)?.key);
  }

  get narrator(): Given {
    const p = this.plan;
    if (p) return { name: p.character.name, traits: p.character.traits, pronoun: p.character.pronoun };
    if (this.cast) return { name: this.cast.name, traits: this.cast.traits, pronoun: this.cast.pronoun };
    return this.st.narrator ?? { name: "Narrator", traits: "", pronoun: "its" };
  }

  get given(): Given | null {
    if (this.cast) return { name: this.cast.name, traits: this.cast.traits, pronoun: this.cast.pronoun, personality: this.cast.personality };
    return this.st.narrator ?? null;
  }

  get voice(): GivenVoice | null {
    const v = this.rec.voice as GivenVoice | undefined;
    if (v?.voice_id) return v;
    if (this.cast?.voice?.voice_id) return { ...this.cast.voice };
    return null;
  }

  get language() {
    return this.data.languages.find((l) => l.code === this.rec.lang);
  }

  /* --- persistence ------------------------------------------------ */

  log(stage: string, msg: string) {
    const events: any[] = (this.rec.events ??= []);
    if (events[events.length - 1]?.msg === msg) return;
    events.push({ t: Math.round((Date.now() / 1000 - this.rec.created) * 10) / 10, stage, msg });
    if (events.length > 200) events.splice(0, events.length - 200);
  }

  async save() {
    const p = this.plan;
    const st = this.st;
    Object.assign(this.rec, {
      style_label: this.style?.label ?? this.rec.style,
      title: p?.title ?? "",
      subtitle: p?.subtitle ?? "",
      narrator: p?.character ?? (this.cast ? { name: this.cast.name } : {}),
      voice_id: p?.voice_id ?? this.voice?.voice_id ?? "",
      blocks: (p?.blocks ?? []).map((b) => ({ kind: b.kind, text: b.text })),
      assets: {
        sheet: this.sheetRef || undefined,
        hero: this.heroRef || undefined,
        narration: Object.fromEntries((p?.blocks ?? []).filter((b) => b.audio).map((b) => [b.id, this.ref(b.audio)])),
        keyframes: Object.fromEntries(this.specs.filter((s) => s.key).map((s) => [s.shot, this.ref(s.key)])),
        clips: Object.fromEntries(this.specs.filter((s) => s.clip).map((s) => [s.shot, this.ref(s.clip)])),
        music: this.ref(st.music) || undefined,
        end_card: this.ref(st.card) || undefined,
        film: this.ref(st.film) || undefined,
        clean: this.ref(st.clean) || undefined,
      },
      state: st,
    });
    const stages = this.stages(await this.tasks());
    const open = stages.find((s) => s.state === "open");
    this.rec.stage = open?.key ?? "edit";
    if (st.film) {
      this.rec.status = "done";
      this.rec.result = this.result();
    } else {
      this.rec.status = stages.some((s) => s.done > 0) ? "working" : "draft";
      this.rec.result = {};
    }
    await saveRecord(this.rec);
  }

  result() {
    const p = this.plan;
    const t = p && this.specs.length ? P.timeline(p, this.specs) : null;
    return {
      title: `${p?.title ?? this.rec.topic} ${p?.subtitle ?? ""}`.trim(),
      video: this.ref(this.st.film),
      clean: this.ref(this.st.clean) || null,
      poster: this.ref(this.st.card) || this.keyRef(p?.tail.shot ?? "") || null,
      duration: t ? Math.round(t.total * 10) / 10 : 0,
    };
  }

  /* --- the steps -------------------------------------------------- */

  private readTasks(): ManualTask[] {
    const out: ManualTask[] = [];
    if (this.rec.style === "custom") {
      const styleImage = this.rec.style_url;
      out.push({
        key: "look",
        stage: "read",
        kind: "json",
        title: "Describe your illustration style",
        hint: "Show your uploaded illustration to a model that can read images and paste its answer back. The 'anchor' sentence it returns is appended to every image prompt in the film.",
        model: P.VISION,
        modelNote: `${D.DIRECTOR_MODEL} (vision)`,
        prompt: joined(D.STYLE_SYSTEM, D.STYLE_PROMPT),
        params: { model: D.DIRECTOR_MODEL, max_tokens: 6000, reasoning: true },
        refs: styleImage ? [{ n: 1, label: "Your illustration", url: styleImage, kind: "image" }] : [],
        shape: '{"label": "", "anchor": "", "motion": "", "character_hint": "", "palette": {"bg": "#…", "text": "#…", "accent": "#…"}}',
        done: !!this.st.style,
        warn: this.st.style ? `Look: ${this.st.style.label}` : undefined,
      });
    }
    if (!this.cast && this.rec.character_url) {
      out.push({
        key: "who",
        stage: "read",
        kind: "json",
        title: "Describe your character",
        hint: "The traits you get back are pasted into every image prompt, so they have to be concrete and stable.",
        model: P.VISION,
        modelNote: `${D.DIRECTOR_MODEL} (vision)`,
        prompt: joined(D.CHARACTER_SYSTEM, D.characterDescribePrompt(this.rec.character_name || "")),
        params: { model: D.DIRECTOR_MODEL, max_tokens: 6000, reasoning: true },
        refs: [{ n: 1, label: "Your character", url: this.rec.character_url, kind: "image" }],
        shape: '{"name": "", "traits": "", "pronoun": "his|her|its"}',
        done: !!this.st.narrator,
        warn: this.st.narrator ? `Narrator: ${this.st.narrator.name}` : undefined,
      });
    }
    return out;
  }

  private scriptTasks(system: string): ManualTask[] {
    const [blocks, talk] = D.shape(this.rec.minutes);
    const out: ManualTask[] = [
      {
        key: "script",
        stage: "script",
        kind: "json",
        title: "Write the film",
        hint: `One JSON object with ${blocks} blocks, ${talk} of them spoken on camera. Everything downstream is built from it, so read it before you go on.`,
        model: D.DIRECTOR_APP,
        modelNote: D.DIRECTOR_MODEL,
        prompt: joined(system, `TOPIC: ${this.rec.topic}`),
        params: { model: D.DIRECTOR_MODEL, max_tokens: Math.min(64000, 6000 + 900 * blocks), reasoning: true },
        refs: [],
        shape:
          '{"title": "", "subtitle": "", "slug": "", "character": {"name": "", "traits": "", "pronoun": ""}, "voice_id": "", "music_prompt": "", ' +
          '"blocks": [{"kind": "V|T", "text": "", "place": "", "scene": "", "character_in_shot": true, "action": "", "camera": "", "sound": ""}], ' +
          '"tail": {"scene": "", "action": "", "camera": "", "sound": ""}}',
        done: !!this.plan,
      },
    ];
    const p = this.plan;
    if (p) {
      const most = D.mostInserts(p.blocks.length);
      out.push({
        key: "script-edit",
        stage: "script",
        kind: "json",
        title: "Smooth the flow",
        hint: "Optional second pass. It rewrites blocks around jumps and can add bridging voice-overs, so the viewer never wonders how the film got somewhere. Skip it and the script is used as written.",
        model: D.DIRECTOR_APP,
        modelNote: D.DIRECTOR_MODEL,
        prompt: joined(D.CONTINUITY_SYSTEM, this.continuity ?? ""),
        params: { model: D.DIRECTOR_MODEL, max_tokens: Math.min(32000, 6000 + 500 * p.blocks.length), reasoning: true },
        refs: [],
        shape: `{"edits": [{"index": 0, "text": "", "scene": "", "place": ""}], "inserts": [{"after": 0, "text": "", "place": "", "scene": "", "character_in_shot": true, "action": "", "camera": "", "sound": ""}]}  · up to ${most} inserts`,
        optional: true,
        done: this.st.edited !== undefined,
        warn:
          this.st.edited === null
            ? "Skipped"
            : this.st.edited
              ? `${this.st.edited.rewrites} rewritten, ${this.st.edited.bridges} bridging scene${this.st.edited.bridges === 1 ? "" : "s"} added`
              : undefined,
      });
    }
    return out;
  }

  /** Filled in by tasks() because it needs the catalog. */
  private continuity?: string;

  private characterTasks(): ManualTask[] {
    if (this.cast?.sheet && this.cast.hero) return [];
    const style = this.style!;
    const [sheet, hero] = P.characterPrompts(P.charLine(this.narrator), style.anchor);
    const refs: TaskRef[] = [];
    if (this.rec.character_url) refs.push({ n: refs.length + 1, label: "Your character", url: this.rec.character_url, kind: "image", note: P.CHARACTER_REF_NOTE });
    if (this.styleRef) refs.push({ n: refs.length + 1, label: "Style reference", url: this.styleRef, kind: "image", note: P.STYLE_REF_NOTE });
    const lead: string[] = [];
    if (this.rec.character_url) lead.push(P.CHARACTER_REF_NOTE);
    if (this.styleRef) lead.push(`Image ${refs.length} ${P.STYLE_REF_NOTE}.`);
    const pre = refs.length ? lead.join(" ") + " " : "";
    const model = refs.length ? P.EDIT : P.T2I;
    return [
      {
        key: "sheet",
        stage: "character",
        kind: "image",
        title: `${this.narrator.name}: model sheet`,
        hint: "Several views of the same character on a plain backdrop. Every keyframe with the narrator in it uses this as Image 1, so it matters more than it looks.",
        model,
        prompt: pre + sheet,
        params: { image_size: P.WIDE, quality: "high" },
        refs,
        slot: SLOTS.sheet,
        asset: this.st.sheet,
        want: { size: P.WIDE },
        done: !!this.st.sheet,
      },
      {
        key: "hero",
        stage: "character",
        kind: "image",
        title: `${this.narrator.name}: hero portrait`,
        hint: "A single full-body portrait. Used as Image 2 in keyframes and as the look reference in every animated shot.",
        model,
        prompt: pre + hero,
        params: { image_size: P.PORTRAIT, quality: "high" },
        refs,
        slot: SLOTS.hero,
        asset: this.st.hero,
        want: { size: P.PORTRAIT },
        done: !!this.st.hero,
      },
    ];
  }

  private voiceTasks(): ManualTask[] {
    const p = this.plan!;
    const v = this.voice;
    return p.blocks.map((b) => {
      const dur = b.audio?.duration;
      const talk = b.kind === "T";
      const off = talk && dur !== undefined && (dur < P.TALK_MIN || dur > P.TALK_MAX);
      return {
        key: `voice:${b.id}`,
        stage: "voice",
        kind: "audio",
        title: `${b.id} · ${talk ? "on camera" : "voice-over"}`,
        hint: talk
          ? `Spoken on camera, so this recording also drives the lip-sync. It has to last ${P.TALK_MIN}-${P.TALK_MAX} s.`
          : "Voice-over. Its length becomes this block's slot in the cut.",
        model: P.TTS,
        modelNote: v?.name ? `${v.name} · ${v.voice_id}` : p.voice_id,
        prompt: b.text,
        params: { text: b.text, voice: p.voice_id, stability: 0.5, language_code: this.rec.lang },
        refs: [],
        slot: narrationSlot(b.id),
        asset: b.audio,
        want: talk ? { range: [P.TALK_MIN, P.TALK_MAX] } : { note: "any length; it sets the slot for this block" },
        block: { id: b.id, kind: b.kind },
        done: !!b.audio?.duration,
        warn: off ? `${dur!.toFixed(1)} s, outside ${P.TALK_MIN}-${P.TALK_MAX} s: shorten or lengthen the line and record it again, or turn the block into a voice-over` : undefined,
        helpers: talk
          ? [
              {
                title: "Rewrite the line to a different length · replace {TEXT}, {SECONDS}, {WANT} and {LANGUAGE}",
                note: `Current duration: ${dur !== undefined ? `${dur.toFixed(1)} s` : "not measured yet"}. Target: ${P.TALK_MIN}–${P.TALK_MAX} s. {WANT} = "shorter" above 12 s, "longer" below 5.2 s.`,
                model: D.DIRECTOR_APP,
                prompt: joined(D.RESIZE_SYSTEM, D.resizePrompt("{TEXT}", "{SECONDS}", "{WANT}", "{LANGUAGE}")),
                promptPlaceholders: [
                  `{TEXT} — the line: ${b.text.slice(0, 80)}${b.text.length > 80 ? "…" : ""}`,
                  `{SECONDS} — current duration, e.g. ${dur !== undefined ? dur.toFixed(1) : "?"}`,
                  `{WANT} — "shorter" or "longer"`,
                  `{LANGUAGE} — ${this.rec.lang}`,
                ],
              },
            ]
          : undefined,
      };
    });
  }

  private keyframeTasks(): ManualTask[] {
    const style = this.style!;
    const who = this.narrator;
    const hasStyleRef = !!this.styleRef;
    return this.specs.map((spec) => {
      const withChar = spec.with_char && !spec.plain;
      const refs: TaskRef[] = [];
      if (withChar) {
        refs.push({ n: 1, label: "Model sheet", url: this.sheetRef, kind: "image" });
        refs.push({ n: 2, label: "Hero portrait", url: this.heroRef, kind: "image" });
        if (hasStyleRef) refs.push({ n: 3, label: "Style reference", url: this.styleRef, kind: "image", note: P.STYLE_REF_NOTE });
      } else if (hasStyleRef) {
        refs.push({ n: 1, label: "Style reference", url: this.styleRef, kind: "image", note: P.STYLE_REF_NOTE });
      } else if (this.sheetRef) {
        refs.push({ n: 1, label: "Model sheet", url: this.sheetRef, kind: "image" });
      }
      const plainPrompt = `${spec.scene} No readable text anywhere. ${style.anchor}`;
      return {
        key: `key:${spec.shot}`,
        stage: "keyframes",
        kind: "image",
        title: `${spec.shot}${spec.bi < 0 ? " · final shot" : spec.talking ? " · on camera" : ""}`,
        hint: withChar ? "The narrator has to look exactly like the model sheet; that is what Image 1 and 2 are for." : "No narrator in this frame.",
        model: spec.plain ? P.T2I : P.EDIT,
        prompt: spec.plain ? plainPrompt : P.keyframePrompt(who, style.anchor, hasStyleRef, spec.scene, withChar, spec.talking),
        params: { image_size: P.WIDE, quality: "high" },
        refs: spec.plain ? [] : refs,
        slot: keySlot(spec.shot),
        asset: spec.key,
        want: { size: P.WIDE },
        shot: spec.shot,
        helpers: [
          {
            title: "If a safety filter refuses the scene · replace {SCENE} with the original",
            note: "Paste the rewritten scene back into the step; the keyframe prompt is rebuilt around it.",
            model: D.DIRECTOR_APP,
            prompt: joined(D.REPHRASE_SYSTEM, D.rephrasePrompt("{SCENE}")),
            promptPlaceholders: ["{SCENE} — the scene text from this step's prompt"],
          },
          ...(spec.plain
            ? []
            : [
                {
                  title: "Last resort: paint it without the narrator",
                  note: `No reference images, ${P.T2I}. The shot then treats this frame as one without the character in it.`,
                  prompt: plainPrompt,
                },
              ]),
        ],
        done: !!spec.key,
      } satisfies ManualTask;
    });
  }

  private shotTasks(): ManualTask[] {
    const p = this.plan!;
    const style = this.style!;
    const who = this.narrator;
    return this.specs.map((spec, i) => {
      const talking = spec.talking;
      const block = spec.bi >= 0 ? p.blocks[spec.bi] : null;
      const withChar = spec.with_char && !spec.plain;
      if (talking && block) {
        return {
          key: `shot:${spec.shot}`,
          stage: "shots",
          kind: "video",
          title: `${spec.shot} · lip-sync`,
          hint: "No prompt here: a lip-sync model animates the keyframe to the recording. Its own length becomes this block's slot in the cut.",
          model: P.LIPSYNC,
          prompt: "",
          params: {
            image_url: spec.key?.path ?? slotPath(keySlot(spec.shot)),
            audio_url: block.audio?.path ?? slotPath(narrationSlot(block.id)),
            resolution: P.RES,
            enable_transcription: true,
          },
          refs: [
            { n: 1, label: "Keyframe", url: this.keyRef(spec.shot), kind: "image" },
            { n: 2, label: `Narration ${block.id}`, url: this.ref(block.audio), kind: "audio" },
          ],
          slot: shotSlot(spec.shot),
          asset: spec.clip,
          want: { seconds: block.audio?.duration, note: "as long as the recording" },
          shot: spec.shot,
          muted: !spec.keep_sound,
          done: !!spec.clip?.duration,
        } satisfies ManualTask;
      }
      const tail = spec.bi < 0;
      const beat = tail
        ? { scene: spec.scene, action: (p.tail.action ?? "") + P.PULL_BACK, camera: "slow pull-back", sound: p.tail.sound }
        : { scene: spec.scene, action: block!.action, camera: block!.camera, sound: block!.sound };
      const need = P.shotNeed(p, spec, i);
      const seconds = P.shotDuration(need);
      const refs: TaskRef[] = [{ n: 1, label: "Keyframe", url: this.keyRef(spec.shot), kind: "image" }];
      if (withChar) refs.push({ n: 2, label: "Hero portrait", url: this.heroRef, kind: "image" });
      return {
        key: `shot:${spec.shot}`,
        stage: "shots",
        kind: "video",
        title: `${spec.shot}${tail ? " · final shot" : ""}`,
        hint: tail
          ? "The shot the title is lettered over. It pulls back and leaves the upper third calm."
          : "The keyframe is the first frame; the prompt only describes what moves.",
        model: P.R2V,
        prompt: P.shotPrompt(who, style.motion, beat, withChar),
        params: { aspect_ratio: "16:9", resolution: P.RES, duration: seconds, prompt_expansion_mode: "disabled" },
        refs,
        slot: shotSlot(spec.shot),
        asset: spec.clip,
        want: { seconds, note: `${seconds} s asked for, ${P.r3(need)} s used in the cut` },
        shot: spec.shot,
        muted: !spec.keep_sound,
        done: !!spec.clip?.duration,
        warn:
          spec.clip?.duration !== undefined && spec.clip.duration + 0.05 < need
            ? `${spec.clip.duration.toFixed(1)} s is shorter than the ${P.r3(need)} s slot; the last frame will be held to fill it`
            : spec.clip && !spec.checked
              ? "Check the result: if it shows the character repeated side-by-side or on a plain studio backdrop (a model-sheet layout rather than a real scene), click Redo."
              : undefined,
      } satisfies ManualTask;
    });
  }

  private musicTasks(): ManualTask[] {
    const p = this.plan!;
    const length = P.musicLength(p);
    return [
      {
        key: "music",
        stage: "music",
        kind: "audio",
        title: "Score",
        hint: "One instrumental bed for the whole film. The edit drops it to a quiet level under the narration by itself.",
        model: P.MUSIC,
        prompt: p.music_prompt,
        params: { music_length_ms: length, force_instrumental: true, output_format: "mp3_48000_192" },
        refs: [],
        slot: SLOTS.music,
        asset: this.st.music,
        want: { seconds: Math.round(length / 1000), note: `the film runs about ${Math.round(P.filmLength(p))} s` },
        done: !!this.st.music,
      },
    ];
  }

  private endCardTasks(): ManualTask[] {
    const p = this.plan!;
    const tail = p.tail.shot;
    return [
      {
        key: "endcard",
        stage: "endcard",
        kind: "image",
        title: "End card",
        hint: "The final keyframe with the title lettered into the calm space at the top. It is also the film's poster.",
        model: P.EDIT,
        prompt: P.endCardPrompt(p.title, p.subtitle, this.style!.anchor),
        params: { image_size: P.FRAME, quality: "high" },
        refs: [{ n: 1, label: `Keyframe ${tail}`, url: this.keyRef(tail), kind: "image" }],
        slot: SLOTS.card,
        asset: this.st.card,
        want: { size: P.FRAME },
        helpers: [
          {
            title: "If the lettering never comes out right",
            note: `Save the ${tail} keyframe as endcard/card.png unchanged. The film then ends on a clean frame with no title.`,
            prompt: "",
          },
        ],
        done: !!this.st.card,
      },
    ];
  }

  private editTasks(): ManualTask[] {
    return [
      {
        key: "film",
        stage: "edit",
        kind: "video",
        title: "Run the edit",
        hint: "Nothing here is a model. The app writes the cut, the mix and the subtitles as one script; run it in the film's folder and drop the result back.",
        model: "ffmpeg (local)",
        prompt: "",
        refs: [],
        slot: SLOTS.film,
        asset: this.st.film,
        render: true,
        done: !!this.st.film,
      },
      {
        key: "clean",
        stage: "edit",
        kind: "video",
        title: "Keep the version without subtitles",
        hint: "The script writes clean.mp4 on the way. Pick it up too and the film page can toggle subtitles off.",
        model: "ffmpeg (local)",
        prompt: "",
        refs: [],
        slot: SLOTS.clean,
        asset: this.st.clean,
        optional: true,
        done: !!this.st.clean,
      },
    ];
  }

  /* --- assembling the board --------------------------------------- */

  async tasks(): Promise<ManualTask[]> {
    const out: ManualTask[] = [...this.readTasks()];
    const ready = out.every((t) => t.done);
    if (!this.style) return out;

    const system = await D.directorSystem(this.style, this.rec.minutes, this.rec.lang, this.given, this.voice);
    if (this.plan) this.continuity = await D.continuityPrompt(D.continuityScript(this.plan.blocks), this.rec.minutes, this.rec.lang, D.mostInserts(this.plan.blocks.length));
    if (!ready) return out;
    out.push(...this.scriptTasks(system));
    if (!this.plan) return out;
    out.push(...this.characterTasks(), ...this.voiceTasks(), ...this.keyframeTasks(), ...this.shotTasks(), ...this.musicTasks(), ...this.endCardTasks(), ...this.editTasks());
    return out;
  }

  /** The board the UI draws: every stage, what it is waiting for and why. */
  stages(tasks?: ManualTask[]): Stage[] {
    const all = tasks ?? this.cached ?? [];
    const keys: StageKey[] = ["read", "script", "character", "voice", "keyframes", "shots", "music", "endcard", "edit"];
    const of = (k: StageKey) => all.filter((t) => t.stage === k);
    const ready = (k: StageKey) => {
      const list = of(k).filter((t) => !t.optional);
      return list.length > 0 && list.every((t) => t.done);
    };
    const need: Partial<Record<StageKey, [boolean, string]>> = {
      script: [!of("read").some((t) => !t.done), "waiting for your images to be described"],
      character: [!!this.plan, "waiting for the script"],
      voice: [!!this.plan, "waiting for the script"],
      keyframes: [!!this.plan && (ready("character") || !of("character").length), "waiting for the model sheet and the hero portrait"],
      shots: [ready("keyframes") && ready("voice"), "waiting for the keyframes and the narration"],
      music: [ready("voice"), "waiting for the narration, which sets the length"],
      endcard: [ready("keyframes"), "waiting for the final keyframe"],
      edit: [ready("shots") && ready("music") && ready("endcard"), "waiting for the shots, the score and the end card"],
    };
    const out: Stage[] = [];
    for (const key of keys) {
      const list = of(key);
      const [label, note] = STAGE_NOTES[key];
      const [ok, why] = need[key] ?? [true, ""];
      // A stage with no tasks is either still waiting for what comes before it, or does not apply to this film.
      if (!list.length && ok) continue;
      out.push({
        key,
        label,
        note,
        state: !ok ? "locked" : ready(key) ? "done" : "open",
        locked: ok ? undefined : why,
        tasks: list,
        done: list.filter((t) => t.done).length,
        total: list.length,
      });
    }
    return out;
  }

  private cached: ManualTask[] | null = null;
  async board(): Promise<{ tasks: ManualTask[]; stages: Stage[] }> {
    const tasks = await this.tasks();
    this.cached = tasks;
    return { tasks, stages: this.stages(tasks) };
  }

  /* --- taking answers -------------------------------------------- */

  async submit(key: string, raw: string) {
    const parsed = D.parseJson(raw);
    if (key === "look") {
      const d = D.reviewStyle(parsed);
      this.st.style = {
        id: "custom",
        label: d.label || "Custom style",
        thumb: "",
        category: "",
        blurb: "",
        ref: "",
        anchor: d.anchor,
        motion: d.motion,
        character_hint: d.character_hint || "an original narrator that belongs to this world",
        palette: d.palette,
      };
      this.style = this.st.style;
      this.log("read", `Look: ${this.st.style.label}`);
    } else if (key === "who") {
      this.st.narrator = D.reviewCharacter(parsed, this.rec.character_name || "");
      this.log("read", `Narrator: ${this.st.narrator.name}`);
    } else if (key === "script") {
      const { plan, warnings } = await D.reviewPlan(parsed, { minutes: this.rec.minutes, character: this.given, voice: this.voice });
      D.numberPlan(plan);
      this.st.plan = plan;
      this.st.specs = P.buildSpecs(plan);
      this.st.edited = undefined;
      this.log("script", `“${plan.title} ${plan.subtitle}”: ${plan.blocks.length} blocks, narrator ${plan.character.name}`);
      for (const w of warnings) this.log("script", `Note: ${w}`);
      await this.save();
      return warnings;
    } else if (key === "script-edit") {
      const p = this.plan!;
      const { blocks, rewrites, bridges } = D.applyContinuity(p.blocks, parsed, D.mostInserts(p.blocks.length));
      p.blocks = blocks;
      D.numberPlan(p);
      this.st.specs = P.syncSpecs(p, this.specs);
      this.st.edited = { rewrites, bridges };
      this.log("script", `Script editor: ${rewrites} rewritten, ${bridges} bridging scene${bridges === 1 ? "" : "s"} added`);
    } else throw new Error(`nothing to paste into ${key}`);
    await this.save();
    return [];
  }

  async skip(key: string) {
    if (key !== "script-edit") throw new Error(`${key} cannot be skipped`);
    this.st.edited = null;
    this.log("script", "Script editor pass skipped");
    await this.save();
  }

  private place(key: string, info: AssetInfo | undefined) {
    if (key === "sheet") this.st.sheet = info;
    else if (key === "hero") this.st.hero = info;
    else if (key === "music") this.st.music = info;
    else if (key === "endcard") this.st.card = info;
    else if (key === "film") this.st.film = info;
    else if (key === "clean") this.st.clean = info;
    else if (key.startsWith("voice:")) {
      const b = this.blockOf(key.slice(6));
      if (b) b.audio = info;
    } else if (key.startsWith("key:")) {
      const s = this.specOf(key.slice(4));
      if (s) s.key = info;
    } else if (key.startsWith("shot:")) {
      const s = this.specOf(key.slice(5));
      if (s) s.clip = info;
    } else throw new Error(`no file belongs to ${key}`);
  }

  /** Takes a file you point at or drop, measures it, and files it under the name the step expects. */
  async attach(task: ManualTask, file: File) {
    const slot = task.slot;
    if (!slot) throw new Error(`${task.key} does not take a file`);
    const kind: MediaKind = task.kind === "json" ? "image" : task.kind;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!slot.exts.includes(ext)) throw new Error(`${task.title} expects ${slot.exts.map((e) => `.${e}`).join(", ")}, not .${ext}`);
    const path = slotPath(slot, ext);
    await keepAsset(this.full(path), file);
    const info = await measure(path, file, kind);
    if ((kind === "audio" || kind === "video") && !info.duration) throw new Error("Could not read the length of that file; is it complete?");
    this.place(task.key, info);
    this.log(task.stage, `${task.title}: ${info.name}${info.duration ? ` · ${info.duration.toFixed(1)} s` : ""}`);
    await this.save();
    return info;
  }

  /** Picks up anything already sitting in the project folder under the expected name. */
  async sync(tasks?: ManualTask[]): Promise<number> {
    const list = tasks ?? (await this.tasks());
    let found = 0;
    for (const task of list) {
      if (task.done || !task.slot) continue;
      const hit = await findAsset(this.full(task.slot.dir), task.slot.base, task.slot.exts);
      if (!hit) continue;
      const rel = hit.path.slice(this.project.length + 1);
      const kind = kindOfName(hit.path) ?? (task.kind === "json" ? "image" : task.kind);
      const info = await measure(rel, hit.file, kind);
      if ((kind === "audio" || kind === "video") && !info.duration) continue;
      this.place(task.key, info);
      this.log(task.stage, `Picked up ${rel}${info.duration ? ` · ${info.duration.toFixed(1)} s` : ""}`);
      found++;
    }
    if (found) await this.save();
    return found;
  }

  /** Forgets a result so the step comes back. The file itself is left alone. */
  async clear(task: ManualTask) {
    if (task.kind === "json") {
      if (task.key === "look") this.st.style = this.style = undefined;
      else if (task.key === "who") this.st.narrator = undefined;
      else if (task.key === "script") {
        this.st.plan = undefined;
        this.st.specs = undefined;
        this.st.edited = undefined;
      } else if (task.key === "script-edit") this.st.edited = undefined;
    } else this.place(task.key, undefined);
    if (task.stage === "shots" && task.shot) {
      const spec = this.specOf(task.shot);
      if (spec) spec.checked = undefined;
    }
    this.log(task.stage, `${task.title}: cleared`);
    await this.save();
  }

  /* --- the iterative bits ---------------------------------------- */

  /** Rewrites one narration line and drops its recording, for lines that came out too long or too short. */
  async setLine(blockId: string, text: string) {
    const b = this.blockOf(blockId);
    if (!b) throw new Error("unknown block");
    b.text = text.trim();
    b.audio = undefined;
    this.log("voice", `${blockId}: line rewritten`);
    await this.save();
  }

  /** Turns an on-camera block into a voice-over, the way the original did when a line would not fit. */
  async demote(blockId: string) {
    const p = this.plan!;
    const b = this.blockOf(blockId);
    if (!b || b.kind !== "T") throw new Error("only an on-camera block can become a voice-over");
    b.kind = "V";
    if (!b.action) b.action = "The character gestures while the scene breathes with small ambient motion.";
    D.numberPlan(p);
    this.st.specs = P.syncSpecs(p, this.specs);
    this.log("voice", `${blockId} is a voice-over now`);
    await this.save();
  }

  /** Replaces a scene after a safety filter refused it, and drops what was built from it. */
  async rescene(shot: string, scene: string) {
    const spec = this.specOf(shot);
    if (!spec) throw new Error("unknown shot");
    spec.scene = scene.trim();
    spec.rescened = true;
    spec.key = undefined;
    spec.clip = undefined;
    if (spec.bi >= 0) this.plan!.blocks[spec.bi].scene = spec.scene;
    else this.plan!.tail.scene = spec.scene;
    this.log("keyframes", `${shot}: scene rewritten`);
    await this.save();
  }

  /** Marks a keyframe as one that has to be painted without the narrator. */
  async plainly(shot: string, on: boolean) {
    const spec = this.specOf(shot);
    if (!spec) throw new Error("unknown shot");
    spec.plain = on || undefined;
    spec.key = undefined;
    spec.clip = undefined;
    this.log("keyframes", `${shot}: ${on ? "no narrator in this frame" : "narrator back in this frame"}`);
    await this.save();
  }

  /** User confirms the shot looks like a real scene, clearing the QC warning. */
  async confirmShot(shot: string) {
    const spec = this.specOf(shot);
    if (!spec) throw new Error("unknown shot");
    spec.checked = true;
    await this.save();
  }

  /** Keeps or drops one shot's own sound in the mix. */
  async mute(shot: string, keep: boolean) {
    const spec = this.specOf(shot);
    if (!spec) throw new Error("unknown shot");
    spec.keep_sound = keep ? true : undefined;
    this.st.built = undefined;
    this.log("shots", `${shot}: sound ${keep ? "kept" : "dropped"}`);
    await this.save();
  }

  /* --- the edit --------------------------------------------------- */

  kit(): RenderKit {
    const p = this.plan;
    if (!p) throw new Error("there is no script yet");
    const shots: Record<string, string> = {};
    for (const s of this.specs) if (s.clip) shots[s.shot] = s.clip.path;
    const narration: Record<string, string> = {};
    for (const b of p.blocks) if (b.audio) narration[b.id] = b.audio.path;
    return renderKit({
      plan: p,
      specs: this.specs,
      shots,
      narration,
      music: this.st.music?.path ?? "",
      card: this.st.card?.path ?? "",
      font: this.language?.font ?? "Nunito",
      accent: P.namedColor(this.style?.palette?.accent ?? "#f0a45a"),
      lang: this.rec.lang,
    });
  }

  /** The files the edit needs, ready to be written into the folder or downloaded. */
  kitFiles(kit = this.kit()) {
    const title = `${this.plan?.title ?? this.rec.topic} ${this.plan?.subtitle ?? ""}`.trim();
    return [
      ...kit.files,
      { path: "render.ps1", text: powershell(kit, title), note: "Windows · powershell -ExecutionPolicy Bypass -File .\\render.ps1" },
      { path: "render.sh", text: bash(kit, title), note: "macOS and Linux · bash render.sh" },
    ];
  }

  /** Writes the render kit into the project folder. Returns false when there is no folder to write to. */
  async build(): Promise<boolean> {
    const files = this.kitFiles();
    if (!folderBound()) return false;
    await ensureDir(this.full("build"));
    for (const f of files) if (!(await writeText(this.full(f.path), f.text))) return false;
    this.st.built = Math.round(Date.now() / 1000);
    this.log("edit", `Render kit written: ${files.length} files`);
    await this.save();
    return true;
  }
}

export const taskExts = (task: ManualTask) => task.slot?.exts ?? extsFor(task.kind === "json" ? "image" : task.kind);
