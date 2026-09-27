import {
  SLOTS,
  assetRef,
  ensureDir,
  extsFor,
  findAsset,
  folderBound,
  join,
  keepAsset,
  keySlot,
  kindOfName,
  measure,
  narrationSlot,
  shotSlot,
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

export { SLOTS, narrationSlot, keySlot, shotSlot };

/* ------------------------------------------------------------------ *\
   A step you do yourself

   Every task carries everything needed to reproduce, by hand, one call
   the original pipeline made to fal: the endpoint it was written for,
   the system prompt, the prompt, the non-prompt parameters, the
   reference images in the order the prompt talks about them, and the
   file name the answer has to be saved under.
\* ------------------------------------------------------------------ */

export type TaskKind = "json" | "image" | "audio" | "video" | "srt";
export type StageKey = "read" | "script" | "character" | "voice" | "keyframes" | "shots" | "music" | "endcard" | "subtitle" | "edit";

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
  done: boolean;
  warn?: string;
  /** When true, indicates Veo Mode is active for this task. */
  veo?: boolean;
  /** For JSON tasks, the current parsed state serialized as JSON for editing. */
  currentJson?: string;
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
  subtitle: ["Subtitles", "Paste SRT from an LLM vision tool, then burn it in"],
  edit: ["Edit", "Run the render script to produce clean.mp4"],
};

/* ------------------------------------------------------------------ *\
   Where files live
\* ------------------------------------------------------------------ */

/** Joins system prompt and user prompt into one block, separated by a clear divider. */
const joined = (system: string, user: string) => `${system}\n\n---\n\n${user}`;

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
  get folderPath(): string {
    return this.rec.folder_path || "";
  }
  async setFolderPath(folder: string) {
    this.rec.folder_path = folder.trim();
    await this.save();
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
    if (p) return { name: p.character.name, traits: p.character.traits, pronoun: p.character.pronoun, tag: p.character.tag };
    if (this.cast) return { name: this.rec.character_name || this.cast.name, traits: this.cast.traits, pronoun: this.cast.pronoun };
    return this.st.narrator ?? { name: "Narrator", traits: "", pronoun: "its" };
  }

  get given(): Given | null {
    if (this.cast) return { name: this.rec.character_name || this.cast.name, traits: this.cast.traits, pronoun: this.cast.pronoun, personality: this.cast.personality };
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

  /** Storytelling style chosen at creation; projects without one use "auto". */
  get narrative(): D.Narrative {
    const id = (this.rec.narrative as D.NarrativeId | undefined) || "auto";
    return { id, text: this.rec.narrative_text || undefined };
  }

  /** True when this project was created with Veo Mode enabled. */
  get veoMode(): boolean {
    return this.rec.veo === true;
  }

  /**
   * The style anchor sentence used across prompts.
   * In Veo Mode, image ratio instructions (e.g. "widescreen 16:9 composition.") are stripped.
   */
  get styleAnchor(): string {
    const raw = this.style?.anchor ?? "";
    return P.stripRatio(raw);
  }

  get detectedFrame(): P.FrameSize {
    const clip = this.specs.find((s) => s.clip?.width && s.clip?.height)?.clip;
    if (clip?.width && clip?.height) return { width: clip.width - (clip.width % 2), height: clip.height - (clip.height % 2) };
    const key = this.specs.find((s) => s.key?.width && s.key?.height)?.key;
    if (key?.width && key?.height) return { width: key.width - (key.width % 2), height: key.height - (key.height % 2) };
    if (this.st.card?.width && this.st.card?.height) return { width: this.st.card.width - (this.st.card.width % 2), height: this.st.card.height - (this.st.card.height % 2) };
    if (this.st.hero?.width && this.st.hero?.height) return { width: this.st.hero.width - (this.st.hero.width % 2), height: this.st.hero.height - (this.st.hero.height % 2) };
    if (this.st.sheet?.width && this.st.sheet?.height) return { width: this.st.sheet.width - (this.st.sheet.width % 2), height: this.st.sheet.height - (this.st.sheet.height % 2) };
    return P.FRAME;
  }

  get isPortrait(): boolean {
    return this.detectedFrame.height > this.detectedFrame.width;
  }

  get aspectRatio(): string {
    return P.aspectString(this.detectedFrame);
  }

  /**
   * A short, stable voice description string to paste into every Veo shot prompt.
   * Keeps the narrator voice consistent across clips.
   * Comes from the script's "voice_desc" (written once for this character and language).
   * Older scripts without it fall back to "[gender] narrator, [age], [accent], [tone/traits]." from the chosen voice.
   */
  get veoVoiceDesc(): string {
    if (this.plan?.voice_desc) return this.plan.voice_desc;
    return "A warm, natural narrator voice.";
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
        srt: this.ref(st.srt) || undefined,
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
        hint: "Describe visual style from reference image.",
        model: P.VISION,
        modelNote: `${D.DIRECTOR_MODEL} (vision)`,
        prompt: joined(D.STYLE_SYSTEM, D.stylePrompt(this.veoMode)),
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
        hint: "Describe character traits from reference image.",
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
        hint: `Script JSON (${blocks} blocks, ${talk} on camera).`,
        model: D.DIRECTOR_APP,
        modelNote: D.DIRECTOR_MODEL,
        prompt: joined(system, `TOPIC: ${this.rec.topic}`),
        params: { model: D.DIRECTOR_MODEL, max_tokens: Math.min(64000, 6000 + 900 * blocks), reasoning: true },
        refs: [],
        shape:
          `{"title": "", "subtitle": "", "slug": "", "character": {"name": "", "traits": "", "pronoun": ""${this.veoMode ? ', "tag": ""' : ""}}, ${this.veoMode ? '"voice_desc": "", ' : '"voice_id": "", '}"music_prompt": "", ` +
          '"blocks": [{"kind": "V|T", "text": "", "place": "", "scene": "", "character_in_shot": true, "action": "", "camera": "", "sound": ""}], ' +
          '"tail": {"scene": "", "action": "", "camera": "", "sound": ""}}',
        currentJson: this.plan ? JSON.stringify(this.plan, null, 2) : undefined,
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
        hint: "Optional continuity check.",
        model: D.DIRECTOR_APP,
        modelNote: D.DIRECTOR_MODEL,
        prompt: joined(D.CONTINUITY_SYSTEM, this.continuity ?? ""),
        params: { model: D.DIRECTOR_MODEL, max_tokens: Math.min(32000, 6000 + 500 * p.blocks.length), reasoning: true },
        refs: [],
        shape: `{"edits": [{"index": 0, "text": "", "scene": "", "place": ""}], "inserts": [{"after": 0, "text": "", "place": "", "scene": "", "character_in_shot": true, "action": "", "camera": "", "sound": ""}]}  · up to ${most} inserts`,
        currentJson: this.st.edited ? JSON.stringify(this.st.edited, null, 2) : undefined,
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
    const [sheet, hero] = P.characterPrompts(P.charLine(this.narrator), this.styleAnchor);
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
        hint: "Model sheet with multiple views.",
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
        hint: "Full-body character portrait.",
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
    // In Veo mode the spoken audio is embedded inside each generated shot clip — skip TTS entirely.
    if (this.veoMode) return [];
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
        hint: talk ? "On-camera speech." : "Voice-over narration.",
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
    const who = this.narrator;
    const hasStyleRef = !!this.styleRef;
    return this.specs.map((spec, i) => {
      const withChar = spec.with_char && !spec.plain;
      // Previous shot's keyframe for visual continuity (only when it exists)
      const prevSpec = i > 0 ? this.specs[i - 1] : null;
      const prevKeyUrl = prevSpec ? this.keyRef(prevSpec.shot) : undefined;
      const hasPrevKey = !!prevKeyUrl;
      const refs: TaskRef[] = [];
      if (withChar) {
        refs.push({ n: 1, label: "Model sheet", url: this.sheetRef, kind: "image" });
        refs.push({ n: 2, label: "Hero portrait", url: this.heroRef, kind: "image" });
        if (hasPrevKey) refs.push({ n: 3, label: `Prev keyframe (${prevSpec!.shot})`, url: prevKeyUrl, kind: "image", note: "preceding shot — match its colour grade, lighting and background" });
        if (hasStyleRef) refs.push({ n: refs.length + 1, label: "Style reference", url: this.styleRef, kind: "image", note: P.STYLE_REF_NOTE });
      } else if (hasStyleRef) {
        // No narrator: only the style reference, so the frame can show whatever explains the line.
        refs.push({ n: 1, label: "Style reference", url: this.styleRef, kind: "image", note: P.STYLE_REF_NOTE });
      }
      const plainPrompt = `${spec.scene} No readable text anywhere. ${this.styleAnchor}`;
      const hint = withChar ? "Keyframe with character." : "Keyframe.";
      return {
        key: `key:${spec.shot}`,
        stage: "keyframes",
        kind: "image",
        title: `${spec.shot}${spec.bi < 0 ? " · final shot" : spec.talking ? " · on camera" : ""}`,
        hint,
        model: spec.plain || (!withChar && !hasStyleRef) ? P.T2I : P.EDIT,
        prompt: spec.plain ? plainPrompt : P.keyframePrompt(who, this.styleAnchor, hasStyleRef, spec.scene, withChar, spec.talking, hasPrevKey),
        params: { image_size: this.isPortrait ? P.PORTRAIT_9_16 : P.WIDE, quality: "high" },
        refs: spec.plain ? [] : refs,
        slot: keySlot(spec.shot),
        asset: spec.key,
        want: { size: this.isPortrait ? P.PORTRAIT_9_16 : P.WIDE },
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

      // ── Veo Mode: all shots (V, T, tail) are generated by Veo 3 with embedded audio ──
      if (this.veoMode) {
        const tail = spec.bi < 0;
        // Motion only: the keyframe is the first frame, so the scene is not described again.
        const beat = tail
          ? { action: `${P.clause(p.tail.action ?? "")}.${P.PULL_BACK}`, camera: "slow pull-back", sound: p.tail.sound, text: "" }
          : { action: block!.action, camera: block!.camera, sound: block!.sound, text: block!.text };
        const veoWho = { name: who.name, tag: p.character.tag };
        const need = P.shotNeed(p, spec, i, true);
        const seconds = P.shotDuration(need);
        // In Veo Mode, only Keyframe is used as reference (no Hero portrait reference)
        const refs: TaskRef[] = [{ n: 1, label: "Keyframe", url: this.keyRef(spec.shot), kind: "image" }];
        const wordCount = beat.text ? beat.text.split(/\s+/).length : 0;
        return {
          key: `shot:${spec.shot}`,
          stage: "shots",
          kind: "video",
          title: `${spec.shot}${tail ? " · final shot" : talking ? " · on camera" : ""}`,
          hint: tail ? "Final closing shot." : talking ? `${who.name} on camera.` : "",
          model: P.VEO,
          prompt: P.veoShotPrompt(veoWho, style.motion, beat, withChar || tail, this.veoVoiceDesc, talking),
          params: { aspect_ratio: this.aspectRatio, resolution: P.RES, duration: seconds },
          refs,
          slot: shotSlot(spec.shot),
          asset: spec.clip,
          want: {
            seconds,
            note: wordCount > 0 ? `~${wordCount} words` : undefined,
          },
          shot: spec.shot,
          done: !!spec.clip?.duration,
          warn:
            spec.clip && !spec.checked
              ? "Check the result: if it shows a model-sheet layout rather than a real scene, click Redo."
              : undefined,
        } satisfies ManualTask;
      }

      // ── Standard Mode ──────────────────────────────────────────────────────────────────
      if (talking && block) {
        return {
          key: `shot:${spec.shot}`,
          stage: "shots",
          kind: "video",
          title: `${spec.shot} · lip-sync`,
          hint: "Lip-sync animation.",
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
        hint: tail ? "Final closing shot." : "",
        model: P.R2V,
        prompt: P.shotPrompt(who, style.motion, beat, withChar),
        params: { aspect_ratio: this.aspectRatio, resolution: P.RES, duration: seconds, prompt_expansion_mode: "disabled" },
        refs,
        slot: shotSlot(spec.shot),
        asset: spec.clip,
        want: { seconds, note: `${seconds} s asked for, ${P.r3(need)} s used in the cut` },
        shot: spec.shot,
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
    const length = P.musicLength(p, this.veoMode);
    return [
      {
        key: "music",
        stage: "music",
        kind: "audio",
        title: "Score",
        hint: "Instrumental background score.",
        model: P.MUSIC,
        prompt: p.music_prompt,
        params: { music_length_ms: length, force_instrumental: true, output_format: "mp3_48000_192" },
        refs: [],
        slot: SLOTS.music,
        asset: this.st.music,
        want: { seconds: Math.round(length / 1000) },
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
        hint: "Title card still.",
        model: P.EDIT,
        prompt: P.endCardPrompt(p.title, p.subtitle, this.styleAnchor),
        params: { image_size: this.isPortrait ? P.FRAME_9_16 : P.FRAME, quality: "high" },
        refs: [{ n: 1, label: `Keyframe ${tail}`, url: this.keyRef(tail), kind: "image" }],
        slot: SLOTS.card,
        asset: this.st.card,
        want: { size: this.isPortrait ? P.FRAME_9_16 : P.FRAME },
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

  private subtitleTasks(): ManualTask[] {
    const p = this.plan!;
    const blockCount = p.blocks.length;
    const lang = this.rec.lang || "id";

    // Build a plain-text script listing every line with its block number, for the vision prompt.
    const scriptLines = p.blocks
      .map((b, i) => `[${i + 1}] ${b.text}`)
      .concat([`[${blockCount + 1}] (end card — no narration)`])
      .join("\n");

    const systemPrompt = [
      "You are a subtitle generator. You receive a video and a transcript of the narration lines in order.",
      "Your job is to produce a valid SRT subtitle file that matches the spoken narration precisely.",
      "",
      "Rules:",
      "- Use ONLY the words from the provided transcript. Do not add, remove, or paraphrase any text.",
      "- Listen carefully to the video audio to determine the exact start and end time of each narration line.",
      "- Each subtitle entry must contain at most 7 words. If a narration line has more than 7 words, split it into multiple entries by cutting at natural phrase boundaries, distributing the timing proportionally across the words.",
      "- Each entry must stay on screen for at least 1.0 second and at most 3.5 seconds.",
      "- Timestamps must be in standard SRT format: HH:MM:SS,mmm --> HH:MM:SS,mmm",
      "- Entries must be numbered sequentially starting from 1.",
      "- Do not add any other text, comments, or explanation outside the SRT format.",
      "- Language of the subtitles must match the narration: " + lang,
    ].join("\n");

    const userPrompt = [
      "Here is the full narration transcript in order. Match every line to its timing in the video:",
      "",
      scriptLines,
      "",
      "Output a complete, valid SRT file. Start directly with entry number 1.",
    ].join("\n");

    return [
      {
        key: "subtitle",
        stage: "subtitle",
        kind: "srt",
        title: "Generate subtitles",
        hint: "Send build/picture.mp4 (the stitched video, no music) to an LLM vision tool with the prompt below, then paste the SRT output here.",
        model: P.VISION,
        prompt: joined(systemPrompt, userPrompt),
        refs: [],
        asset: this.st.srt,
        currentJson: this.st.srtText,
        done: !!this.st.srt,
      },
      {
        key: "film",
        stage: "subtitle",
        kind: "video",
        title: "Burn subtitles",
        hint: "Run the burn command shown above. It reads clean.mp4 and writes film.mp4.",
        model: "ffmpeg (local)",
        prompt: "",
        refs: [],
        done: !!this.st.film,
      },
    ];
  }

  private editTasks(): ManualTask[] {
    return [
      {
        key: "clean",
        stage: "edit",
        kind: "video",
        title: "Run the edit",
        hint: "Run render.ps1 (Windows) or render.sh (macOS/Linux) inside the film folder. It produces clean.mp4.",
        model: "ffmpeg (local)",
        prompt: "",
        refs: [],
        slot: SLOTS.clean,
        asset: this.st.clean,
        done: !!this.st.clean,
      },
    ];
  }

  /* --- assembling the board --------------------------------------- */

  async tasks(): Promise<ManualTask[]> {
    const out: ManualTask[] = [...this.readTasks()];
    const ready = out.every((t) => t.done);
    if (!this.style) return this.finalizeTasks(out);

    const system = await D.directorSystem(this.style, this.rec.minutes, this.rec.lang, this.given, this.voice, this.veoMode, this.narrative);
    if (this.plan) this.continuity = await D.continuityPrompt(D.continuityScript(this.plan.blocks, this.plan.tail), this.rec.minutes, this.rec.lang, D.mostInserts(this.plan.blocks.length));
    if (!ready) return this.finalizeTasks(out);
    out.push(...this.scriptTasks(system));
    if (!this.plan) return this.finalizeTasks(out);
    out.push(...this.characterTasks(), ...this.voiceTasks(), ...this.keyframeTasks(), ...this.shotTasks(), ...this.musicTasks(), ...this.endCardTasks(), ...this.editTasks(), ...this.subtitleTasks());
    return this.finalizeTasks(out);
  }

  private finalizeTasks(tasks: ManualTask[]): ManualTask[] {
    const veo = this.veoMode;
    return tasks.map((t) => {
      if (veo) {
        const { params: _params, ...rest } = t;
        return { ...rest, veo: true };
      }
      return t;
    });
  }

  /** The board the UI draws: every stage, what it is waiting for and why. */
  stages(tasks?: ManualTask[]): Stage[] {
    const all = tasks ?? this.cached ?? [];
    const veo = this.veoMode;
    // In Veo mode there are no voice tasks, so skip the voice stage entirely.
    const keys: StageKey[] = veo
      ? ["read", "script", "character", "keyframes", "shots", "music", "endcard", "edit", "subtitle"]
      : ["read", "script", "character", "voice", "keyframes", "shots", "music", "endcard", "edit", "subtitle"];
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
      shots: this.veoMode
        ? [ready("keyframes"), "waiting for the keyframes"]
        : [ready("keyframes") && ready("voice"), "waiting for the keyframes and the narration"],
      music: this.veoMode
        ? [!!this.plan, "waiting for the script"]
        : [ready("voice"), "waiting for the narration, which sets the length"],
      endcard: [ready("keyframes"), "waiting for the final keyframe"],
      edit: [ready("shots") && ready("music") && ready("endcard"), "waiting for the shots, the score and the end card"],
      subtitle: [ready("shots") && ready("music") && ready("endcard"), ""],
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
    // SRT paste — handle before parseJson since the content is not JSON.
    if (key === "subtitle") {
      const text = (typeof raw === "string" ? raw : "").trim();
      if (!text) throw new Error("Paste the SRT content into the field before confirming.");
      // Accept both HH:MM:SS,mmm and MM:SS,mmm timestamp formats.
      if (!/\d{1,2}:\d{2}[,:.]\d{3}/.test(text)) {
        throw new Error("This doesn't look like a valid SRT file. Make sure it contains timestamp lines like 00:00:01,000 --> 00:00:03,500.");
      }
      // Normalise MM:SS,mmm → 00:MM:SS,mmm so the burn command gets standard SRT.
      const normalised = text.replace(/^(\d+)\n(\d{2}:\d{2}[,:.]\d{3} --> \d{2}:\d{2}[,:.]\d{3})$/gm, (_, n, ts) => {
        const fixTs = (t: string) => /^\d{2}:\d{2}[,:.]\d{3}$/.test(t) ? `00:${t}` : t;
        const [from, to] = ts.split(" --> ");
        return `${n}\n${fixTs(from)} --> ${fixTs(to)}`;
      });
      const finalText = normalised.endsWith("\n") ? normalised : normalised + "\n";
      const path = "subtitles.srt";
      const blob = new Blob([finalText], { type: "text/plain" });
      const file = new File([blob], "subtitles.srt", { type: "text/plain" });
      await keepAsset(this.full(path), file);
      const entryCount = (finalText.match(/\d{2}:\d{2}:\d{2}[,:.]\d{3} --> /g) ?? finalText.match(/\d{2}:\d{2}[,:.]\d{3} --> /g) ?? []).length;
      const info: AssetInfo = { path, name: "subtitles.srt", size: file.size, at: Date.now() / 1000 };
      this.st.srt = info;
      this.st.srtText = finalText;
      this.st.built = undefined;
      this.log("subtitle", `Subtitles: ${entryCount} entries pasted`);
      await this.save();
      return [];
    }

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
      const { plan, warnings } = await D.reviewPlan(parsed, { minutes: this.rec.minutes, character: this.given, voice: this.voice, veo: this.veoMode });
      D.numberPlan(plan);
      // Preserve existing audio recordings on blocks if block id and text match
      if (this.st.plan?.blocks) {
        for (const nb of plan.blocks) {
          const old = this.st.plan.blocks.find((b) => b.id === nb.id);
          if (old?.audio && old.text === nb.text) nb.audio = old.audio;
        }
      }
      this.st.plan = plan;
      this.st.specs = this.st.specs?.length ? P.syncSpecs(plan, this.st.specs) : P.buildSpecs(plan);
      this.st.edited = undefined;
      this.log("script", `“${plan.title} ${plan.subtitle}”: ${plan.blocks.length} blocks, narrator ${plan.character.name}`);
      for (const w of warnings) this.log("script", `Note: ${w}`);
      await this.save();
      return warnings;
    } else if (key === "script-edit") {
      const p = this.plan!;
      const { blocks, rewrites, bridges, tail } = D.applyContinuity(p.blocks, parsed, D.mostInserts(p.blocks.length), p.tail);
      p.blocks = blocks;
      if (tail) p.tail = tail;
      D.numberPlan(p);
      this.st.specs = P.syncSpecs(p, this.specs);
      this.st.edited = { rewrites, bridges };
      this.log("script", `Script editor: ${rewrites} rewritten, ${bridges} bridging scene${bridges === 1 ? "" : "s"} added`);
    } else throw new Error(`nothing to paste into ${key}`);
    await this.save();
    return [];
  }

  async skip(key: string) {
    if (key === "script-edit") {
      this.st.edited = null;
      this.log("script", "Script editor pass skipped");
    } else if (key === "subtitle") {
      // Skipping means use the auto-generated subtitles.ass — clear any previously pasted SRT.
      this.st.srt = undefined;
      this.log("subtitle", "Subtitle step skipped — using auto-generated subtitles");
    } else {
      throw new Error(`${key} cannot be skipped`);
    }
    await this.save();
  }

  private place(key: string, info: AssetInfo | undefined) {
    if (key === "sheet") this.st.sheet = info;
    else if (key === "hero") this.st.hero = info;
    else if (key === "music") this.st.music = info;
    else if (key === "endcard") this.st.card = info;
    else if (key === "subtitle") this.st.srt = info;
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

  /** Takes a file you point at or drop, measures it, and files it. Uses the expected slot path if matching, or real filename if picked otherwise. */
  async attach(task: ManualTask, file: File) {
    const slot = task.slot;
    if (!slot) throw new Error(`${task.key} does not take a file`);
    const kind: MediaKind = task.kind === "json" || task.kind === "srt" ? "image" : task.kind;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!slot.exts.includes(ext)) throw new Error(`${task.title} expects ${slot.exts.map((e) => `.${e}`).join(", ")}, not .${ext}`);
    const dot = file.name.lastIndexOf(".");
    const base = dot > 0 ? file.name.slice(0, dot) : file.name;
    const isExpected = base.toLowerCase() === slot.base.toLowerCase();

    // Check if the file has a native OS path (e.g. from Chromium/Electron/NW.js)
    const nativePath = (file as { path?: string })?.path;
    let fullPath = typeof nativePath === "string" && nativePath ? nativePath : undefined;

    if (fullPath) {
      const sep = fullPath.includes("/") ? "/" : "\\";
      const last = fullPath.lastIndexOf(sep);
      if (last > 0) {
        const folder = fullPath.slice(0, last);
        if (!this.rec.folder_path) this.rec.folder_path = folder;
      }
    } else if (this.rec.folder_path) {
      const sep = this.rec.folder_path.includes("/") ? "/" : "\\";
      fullPath = `${this.rec.folder_path.replace(/[\\/]+$/, "")}${sep}${file.name}`;
    }

    // When a custom file is picked, use its actual name directly
    const path = isExpected ? slotPath(slot, ext) : file.name;
    await keepAsset(this.full(path), file);
    const info = await measure(path, file, kind);
    if (fullPath) {
      info.fullPath = fullPath;
      const sep = fullPath.includes("/") ? "/" : "\\";
      const last = fullPath.lastIndexOf(sep);
      if (last > 0) info.folder = fullPath.slice(0, last);
    }
    if ((kind === "audio" || kind === "video") && !info.duration) throw new Error("Could not read the length of that file; is it complete?");
    this.place(task.key, info);
    this.log(task.stage, `${task.title}: ${info.name}${info.duration ? ` · ${info.duration.toFixed(1)} s` : ""}`);
    await this.save();
    return info;
  }

  /** Reads the expected file for a task from the bound project folder. */
  async readExpected(task: ManualTask): Promise<AssetInfo> {
    const slot = task.slot;
    if (!slot) throw new Error(`${task.title} does not take a file`);
    let hit = await findAsset(this.full(slot.dir), slot.base, slot.exts);
    if (!hit && slot.dir) hit = await findAsset(slot.dir, slot.base, slot.exts);
    if (!hit) hit = await findAsset("", slot.base, slot.exts);
    if (!hit) {
      const folderName = this.rec.folder_path || this.project;
      const expected = slotPath(slot);
      throw new Error(`File not found: ${join(folderName, expected)}`);
    }
    const rel = hit.path.startsWith(`${this.project}/`) ? hit.path.slice(this.project.length + 1) : hit.path;
    const kind = kindOfName(hit.path) ?? (task.kind === "json" || task.kind === "srt" ? "image" : task.kind);
    const info = await measure(rel, hit.file, kind);
    if (this.rec.folder_path) {
      const sep = this.rec.folder_path.includes("/") ? "/" : "\\";
      info.fullPath = `${this.rec.folder_path.replace(/[\\/]+$/, "")}${sep}${info.name}`;
      info.folder = this.rec.folder_path;
    }
    if ((kind === "audio" || kind === "video") && !info.duration) {
      throw new Error("Could not read the length of that file; is it complete?");
    }
    this.place(task.key, info);
    this.log(task.stage, `Picked up ${rel}${info.duration ? ` · ${info.duration.toFixed(1)} s` : ""}`);
    await this.save();
    return info;
  }

  /** Picks up anything already sitting in the project folder under the expected name. */
  async sync(tasks?: ManualTask[]): Promise<number> {
    const list = tasks ?? (await this.tasks());
    let found = 0;
    for (const task of list) {
      if (task.done || !task.slot) continue;
      let hit = await findAsset(this.full(task.slot.dir), task.slot.base, task.slot.exts);
      if (!hit && task.slot.dir) hit = await findAsset(task.slot.dir, task.slot.base, task.slot.exts);
      if (!hit) hit = await findAsset("", task.slot.base, task.slot.exts);
      if (!hit) continue;
      const rel = hit.path.startsWith(`${this.project}/`) ? hit.path.slice(this.project.length + 1) : hit.path;
      const kind = kindOfName(hit.path) ?? (task.kind === "json" || task.kind === "srt" ? "image" : task.kind);
      const info = await measure(rel, hit.file, kind);
      if ((kind === "audio" || kind === "video") && !info.duration) continue;
      if (this.rec.folder_path) {
        const sep = this.rec.folder_path.includes("/") ? "/" : "\\";
        info.fullPath = `${this.rec.folder_path.replace(/[\\/]+$/, "")}${sep}${info.name}`;
        info.folder = this.rec.folder_path;
      }
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
    } else if (task.kind === "srt") {
      this.st.srt = undefined;
      // Keep srtText so the textarea is pre-populated when the user wants to edit.
      this.st.built = undefined;
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

  /* --- swap character mid-project -------------------------------- */

  /**
   * Replaces the narrator with a different preset cast member (or clears to "invent").
   * Drops all character-dependent assets: sheet, hero, every keyframe, every shot, end card, and the
   * assembled film. Script and narration audio are kept because they do not depend on the visual look.
   */
  async changeCharacter(newId: string, newName: string): Promise<void> {
    const newCast = newId ? (this.data.characters.find((c) => c.id === newId) ?? null) : null;

    // Update identity fields on the record and the instance
    this.cast = newCast;
    this.rec.character_id = newId;
    this.rec.character_name = newName;
    this.rec.character_url = "";

    // Preset characters force their own style; mirror what the constructor does
    if (newCast) {
      this.rec.style = newCast.style;
      const preset = this.data.styles.find((s) => s.id === newCast.style);
      this.style = this.st.style = preset;
      this.styleRef = preset?.ref ?? "";
      this.rec.style_label = preset?.label ?? newCast.style;
    }

    // Update plan's character block so prompts generated later use the new traits
    if (this.plan && newCast) {
      this.plan.character.name = newName || newCast.name;
      this.plan.character.traits = newCast.traits;
      this.plan.character.pronoun = newCast.pronoun;
    }

    // Wipe describe-character result (only exists for custom-uploaded characters)
    this.st.narrator = undefined;

    // Wipe character visuals — sheet and hero images are now wrong
    this.st.sheet = undefined;
    this.st.hero = undefined;

    // Wipe every keyframe and shot that was built with the old character
    for (const spec of this.specs) {
      spec.key = undefined;
      spec.clip = undefined;
      spec.checked = undefined;
    }

    // Wipe end card and the assembled film
    this.st.card = undefined;
    this.st.film = undefined;
    this.st.clean = undefined;
    this.st.built = undefined;

    this.log("character", `Character changed to ${newName || newCast?.name || "new character"}`);
    await this.save();
  }

  /* --- the edit --------------------------------------------------- */

  kit(): RenderKit {
    const p = this.plan;
    if (!p) throw new Error("there is no script yet");
    const shots: Record<string, string> = {};
    for (const s of this.specs) {
      if (s.clip) shots[s.shot] = (s.clip.fullPath ? s.clip.fullPath.replace(/\\/g, "/") : s.clip.path);
    }
    const narration: Record<string, string> = {};
    // In Veo mode narration is embedded in each shot clip — no separate audio files.
    if (!this.veoMode) {
      for (const b of p.blocks) {
        if (b.audio) narration[b.id] = (b.audio.fullPath ? b.audio.fullPath.replace(/\\/g, "/") : b.audio.path);
      }
    }
    return renderKit({
      plan: p,
      specs: this.specs,
      shots,
      narration,
      music: this.st.music?.fullPath ? this.st.music.fullPath.replace(/\\/g, "/") : (this.st.music?.path ?? ""),
      card: this.st.card?.fullPath ? this.st.card.fullPath.replace(/\\/g, "/") : (this.st.card?.path ?? ""),
      font: this.language?.font ?? "Nunito",
      accent: P.namedColor(this.style?.palette?.accent ?? "#f0a45a"),
      lang: this.rec.lang,
      veo: this.veoMode,
      frame: this.detectedFrame,
      srtPath: this.st.srt ? (this.st.srt.fullPath ?? this.full(this.st.srt.path)) : undefined,
    });
  }

  /** The files the edit needs (render scripts + concat/filter lists), ready to be written or downloaded. */
  kitFiles(kit = this.kit()) {
    const title = `${this.plan?.title ?? this.rec.topic} ${this.plan?.subtitle ?? ""}`.trim();
    return [
      ...kit.files,
      { path: "render.ps1", text: powershell(kit, title), note: "Windows · powershell -ExecutionPolicy Bypass -File .\\render.ps1" },
      { path: "render.sh", text: bash(kit, title), note: "macOS and Linux · bash render.sh" },
    ];
  }

  /** The subtitle files (subtitles.ass fallback + subtitles.srt), written when the subtitle stage starts. */
  burnFiles(kit = this.kit()) {
    return kit.burnFiles;
  }

  /** Writes the render kit (edit files) into the project folder. Returns false when there is no folder to write to. */
  async build(): Promise<boolean> {
    const kit = this.kit();
    const files = this.kitFiles(kit);
    if (!folderBound()) return false;
    await ensureDir(this.full("build"));
    await ensureDir("build");
    for (const f of files) {
      await writeText(this.full(f.path), f.text);
      await writeText(f.path, f.text);
    }
    // Also write subtitle files now so they're ready before the subtitle stage.
    for (const f of kit.burnFiles) {
      await writeText(this.full(f.path), f.text);
      await writeText(f.path, f.text);
    }
    this.st.built = Math.round(Date.now() / 1000);
    this.log("edit", `Render kit written: ${files.length + kit.burnFiles.length} files`);
    await this.save();
    return true;
  }
}

export const taskExts = (task: ManualTask) => task.slot?.exts ?? extsFor(task.kind === "json" || task.kind === "srt" ? "image" : task.kind);
