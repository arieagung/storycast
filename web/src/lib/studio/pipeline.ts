import type { AssetInfo } from "./assets";
import type { StyleFull } from "./data";
import { slugify, type Block, type Given, type GivenVoice, type NarrativeId, type Plan } from "./director";
import type { FilmRecord } from "./store";

/* ------------------------------------------------------------------ *\
   The fal endpoints the original pipeline called.

   Nothing here talks to fal any more; every step names the endpoint it
   was written for so you know which of your own models to reach for.
\* ------------------------------------------------------------------ */

export const T2I = "openai/gpt-image-2.5/flare/text-to-image";
export const EDIT = "openai/gpt-image-2.5/flare/edit";
export const R2V = "minimax/h3-max/reference-to-video";
export const LIPSYNC = "minimax/h3-max/lip-sync/image-to-video";
export const VEO = "google/veo-3";
export const TTS = "fal-ai/elevenlabs/tts/eleven-v3";
export const MUSIC = "elevenlabs/music/v2.5";
export const TRIM = "fal-ai/workflow-utilities/trim-video";
export const MERGE = "fal-ai/ffmpeg-api/merge-videos";
export const STILL = "fal-ai/ffmpeg-api/images-to-video";
export const COMPOSE = "fal-ai/ffmpeg-api/compose";
export const LOUDNORM = "fal-ai/ffmpeg-api/loudnorm";
export const MERGE_AV = "fal-ai/ffmpeg-api/merge-audio-video";
export const SUBTITLE = "fal-ai/workflow-utilities/auto-subtitle";
export const SEPARATE = "fal-ai/sam-audio/separate";
export const FRAME_AT = "fal-ai/ffmpeg-api/extract-frame";
export const VISION = "openrouter/router/vision";
export const CHECKER = "google/gemini-3.8-flash";

export const RES = "768P";
export const FRAME = { width: 1344, height: 768 };
export const FRAME_9_16 = { width: 768, height: 1344 };
export const STYLE_REF_NOTE = "shows only the target art style: match its medium, linework, texture, lighting and palette; do not copy its content";
export const WIDE = { width: 1920, height: 1088 };
export const PORTRAIT = { width: 1088, height: 1440 };
export const PORTRAIT_9_16 = { width: 1088, height: 1920 };

export type FrameSize = { width: number; height: number };

export function detectFrameFromAssets(assets: (AssetInfo | undefined)[], fallback: FrameSize = FRAME): FrameSize {
  for (const a of assets) {
    if (a?.width && a?.height) {
      const w = a.width - (a.width % 2);
      const h = a.height - (a.height % 2);
      return { width: w, height: h };
    }
  }
  return fallback;
}

export function aspectString(frame: FrameSize): string {
  const ratio = frame.width / frame.height;
  if (ratio < 0.7) return "9:16";
  if (ratio > 1.4) return "16:9";
  if (Math.abs(ratio - 1) < 0.15) return "1:1";
  return `${frame.width}:${frame.height}`;
}
export const [LEAD, GAP, TAIL_DUR, END_CARD, FPS] = [1.5, 0.35, 8.0, 4.0, 24];
export const CARD_FADE = 0.75;
export const [MUSIC_LUFS, FINAL_LUFS] = [-30, -16];
export const [TALK_MIN, TALK_MAX] = [5.2, 14.6];
export const PULL_BACK =
  " The character stays small in the lower half of the frame; the camera never moves closer, it slowly pulls back, keeping the upper half of the frame calm open space.";

export const CHARACTER_REF_NOTE = "Image 1 is the character: keep its design, proportions, colors and props exactly.";
export const SPEECH_PROMPT = "people talking, human speech and voices";
export const SHEET_CHECK_SYSTEM = "You are a strict film quality checker. Answer with JSON only.";
export const SHEET_CHECK_PROMPT =
  "Image 1 is a character model sheet (the same character drawn several times). The other images are frames from a " +
  "film shot. Does any of them show a model sheet or turnaround layout instead of a real scene: the character " +
  'repeated side by side, a plain studio background, or a pose lineup like Image 1? Return {"sheet": true|false}.';

type Who = { name: string; traits: string; pronoun: string; tag?: string };
/** Full description: only for drawing the model sheet and hero portrait, where there is no image to copy yet. */
export const charLine = (c: Who) => `${c.name.toUpperCase()}, ${c.traits}`;

/**
 * What the narrator is, without how it looks ("the small hedgehog"). Prompts that already hand the
 * model sheet over as images use this, so the traits are never re-described next to the pictures.
 * Falls back to the head of the traits ("a small hedgehog with …" → "a small hedgehog") on old plans without a tag.
 */
export function charTag(c: Who): string {
  const tag = (c.tag ?? "").trim().replace(/[.\s]+$/, "");
  if (tag) return tag;
  const head = (c.traits ?? "").split(/,|;|\s+with\s+|\s+wearing\s+/i)[0]?.trim() ?? "";
  return /^(a|an|the)\s/i.test(head) && head.split(/\s+/).length <= 5 ? head : "";
}

/** "HAZEL, the small hedgehog", or just "HAZEL" when nothing short is known. */
export const charRef = (c: Who) => {
  const tag = charTag(c);
  return tag ? `${c.name.toUpperCase()}, ${tag}` : c.name.toUpperCase();
};

/**
 * Strips image aspect ratio / composition instructions (e.g. "widescreen 16:9 composition.") from prompt or anchor text.
 */
export function stripRatio(text: string): string {
  if (!text) return "";
  return text
    .replace(/(?:,\s*|\.\s*)?widescreen\s+16:9\s+composition\.?/gi, "")
    .replace(/(?:,\s*|\.\s*)?16:9\s+(?:composition|aspect\s+ratio|ratio)\.?/gi, "")
    .replace(/(?:,\s*|\.\s*)?widescreen\s+composition\.?/gi, "")
    .trim()
    .replace(/,\s*$/, ".")
    .replace(/\.\.+$/, ".")
    .replace(/([^.!?])$/, "$1.");
}

export function keyframePrompt(c: Who, anchor: string, styleRef: boolean, scene: string, withChar: boolean, talking: boolean, prevKey = false) {
  const pron = c.pronoun || "its";
  if (!withChar) {
    // Without character: the style reference is the only image, so the scene is free to show
    // whatever explains the line best (a cross-section, a close-up, the past) instead of the previous set.
    const lead = styleRef ? `Image 1 ${STYLE_REF_NOTE}. ` : "";
    return `${lead}New film still, no characters in this frame. ${scene} No readable text anywhere. ${anchor}`;
  }
  // With character: Image 1 = model sheet, Image 2 = hero portrait, then prev keyframe?, then style ref?
  const talk = talking ? ` ${c.name} faces the camera in a medium close-up, talking warmly with ${pron} mouth open.` : "";
  let n = 2; // sheet=1, hero=2
  const extraParts: string[] = [];
  if (prevKey) { n++; extraParts.push(` Image ${n} is the preceding shot: match its colour grade and rendering; keep its set only if this scene happens in the same place, otherwise paint the new setting the scene describes.`); }
  if (styleRef) { n++; extraParts.push(` Image ${n} ${STYLE_REF_NOTE}.`); }
  return `Image 1 and Image 2 show ${charRef(c)}. Keep ${pron} design exactly as drawn there: same body, colors, clothing and accessories, nothing added or changed.${extraParts.join("")} New film still: ${scene}${talk} No readable text anywhere. ${anchor}`;
}

export function shotPrompt(c: Who, motion: string, b: { scene: string; action: string; camera?: string; sound?: string }, withChar: boolean) {
  const body = `${b.action} ${b.camera ?? ""}.`.replaceAll("..", ".");
  const tail = `${motion} Sound: ${b.sound ?? "soft ambience"}. No dialogue, no speech, no music. No readable text.`;
  if (withChar)
    return (
      `Image 1 is the opening frame of this shot: ${b.scene} ${body} ` +
      `Image 2 is a reference portrait of ${charRef(c)}, only for keeping ${c.name}'s look consistent: never show Image 2 ` +
      `itself, never a character sheet, a lineup or several copies of ${c.name}. Nobody speaks: ${c.name}'s mouth stays closed. ${tail}`
    );
  return `Image 1 is the opening frame of this shot: ${b.scene} ${body} ${tail}`;
}

/** Drops trailing periods and spaces so a fragment can be closed with exactly one period. */
export const clause = (s: string) => s.trim().replace(/[.\s]+$/, "");

/** A fragment closed with exactly one period (kept as is when it already ends in ! or ?). */
const sentence = (s: string) => {
  const t = clause(s);
  return /[!?]$/.test(t) ? t : `${t}.`;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The spoken line in double quotes; inner double quotes become single quotes so the line stays one quoted span. */
export const spoken = (s: string) => `"${s.trim().replace(/"/g, "'")}"`;

/**
 * Veo Mode shot prompt (image-to-video, the keyframe is the first frame).
 * Following Google's Veo image-to-video guidance it prompts for motion only: the keyframe already
 * carries the subject, set, lighting and style, so none of that is described again.
 * The narrator is introduced once by name and a short generic tag ("Patch, the felt bear"),
 * then referred to by name only. The camera move is its own sentence.
 * V blocks = off-screen voiceover; T blocks = on-camera lip-synced speech; an empty text = nobody speaks (tail).
 * The spoken line is always wrapped in double quotes after a colon.
 * voiceDesc is one sentence repeated verbatim in every shot so the voice stays the same across clips.
 * Always ends with "No background music." so individual clips can be merged cleanly.
 */
export function veoShotPrompt(
  c: { name: string; tag?: string },
  motion: string,
  b: { action: string; camera?: string; sound?: string; text: string },
  withChar: boolean,
  voiceDesc: string,
  talking: boolean,
): string {
  const tag = clause(c.tag ?? "");
  const out: string[] = [];
  if (talking) {
    out.push(`${tag ? `${c.name}, ${tag},` : c.name} faces the camera in a medium close-up and talks.`);
  } else if (withChar && tag) {
    out.push(`${cap(tag)} is ${c.name}.`);
  }
  if (clause(b.action)) out.push(sentence(b.action));
  if (clause(b.camera ?? "")) out.push(`Camera: ${sentence(b.camera!)}`);
  if (clause(motion)) out.push(sentence(motion));
  const voice = sentence(voiceDesc);
  if (!clause(b.text)) out.push("Nobody speaks.");
  else if (talking) out.push(`${c.name} says: ${spoken(b.text)}`, `Voice: ${voice}`, "Mouth synced naturally to the words.");
  else out.push(`Off-screen narrator. Voice: ${voice}`, `The narrator says: ${spoken(b.text)}`);
  out.push(`Sound: ${sentence(b.sound || "soft ambience")}`, "No background music.");
  return out.join(" ");
}

export function endCardPrompt(title: string, subtitle: string, anchor: string) {
  return (
    `Keep this illustration exactly as it is and add the film title hand-lettered in the calm open space of the upper third: ` +
    `"${title}" large, and below it, smaller, "${subtitle}". Lettering drawn in the same medium and palette as the ` +
    `illustration, perfectly spelled, centred, nothing else added. ${anchor}`
  );
}

export const shotDuration = (need: number) => Math.max(5, Math.min(15, Math.ceil(need) + 1));

export function characterPrompts(line: string, anchor: string): [string, string] {
  const sheet =
    `Character model sheet for an animated film. The character is ${line}. The sheet shows full-body front view, ` +
    `three-quarter view, side profile, back view, and three head close-ups (curious, happy, talking with mouth open). Plain soft ` +
    `light-grey backdrop, even soft studio lighting, clean spacing, consistent design across all views, no text labels. Style: ${anchor}`;
  const hero =
    `Hero portrait of ${line}. Standing full body, three-quarter view, looking at the viewer with a warm smile, one hand raised in a wave. ` +
    `Plain soft backdrop, soft studio light. Style: ${anchor}`;
  return [sheet, hero];
}

export function subtitleInput(lang: string, font: string, accent: string) {
  return {
    language: lang,
    font_name: font,
    font_weight: "bold",
    font_color: "white",
    highlight_color: namedColor(accent),
    stroke_color: "black",
    stroke_width: 3,
    font_size: 54,
    words_per_subtitle: 4,
    position: "bottom",
    y_offset: 40,
    enable_animation: true,
  };
}

/* ------------------------------------------------------------------ *\
   The record
\* ------------------------------------------------------------------ */

export type JobInput = {
  topic: string;
  style: string;
  minutes: number;
  lang: string;
  style_url: string;
  character_url: string;
  character_name: string;
  character_id: string;
  voice: GivenVoice | Record<string, never>;
  /** Storytelling style id (see NARRATIVES in director.ts); "auto" when missing. */
  narrative?: NarrativeId;
  /** Free text for the "custom" storytelling style. */
  narrative_text?: string;
};

export type Spec = {
  shot: string;
  bi: number;
  scene: string;
  talking: boolean;
  with_char: boolean;
  /** Set when the scene was rewritten to get past a safety filter. */
  rescened?: boolean;
  /** True when the keyframe had to be made without the narrator. */
  plain?: boolean;
  key?: AssetInfo;
  clip?: AssetInfo;
  /**
   * Video models tend to mumble, and the original had to strip that speech out
   * with sam-audio before it could use a shot's sound. Without that step the
   * safe default is silence, so a shot's own audio only reaches the mix when
   * you listen to it and ask for it.
   */
  keep_sound?: true;
  /** Set by the user after visually confirming the shot is a real scene, not a model-sheet layout. */
  checked?: true;
};

export type State = {
  style?: StyleFull;
  narrator?: Given;
  plan?: Plan;
  specs?: Spec[];
  /** null once the optional script-editor pass is skipped. */
  edited?: { rewrites: number; bridges: number } | null;
  sheet?: AssetInfo;
  hero?: AssetInfo;
  music?: AssetInfo;
  card?: AssetInfo;
  /** User-supplied SRT file (pasted from an LLM vision tool). When present, overrides the auto-generated subtitles. */
  srt?: AssetInfo;
  /** Raw text of the user-supplied SRT, kept so the textarea can be pre-populated on redo. */
  srtText?: string;
  film?: AssetInfo;
  clean?: AssetInfo;
  /** Epoch seconds the render kit was last written. */
  built?: number;
};

const now = () => Date.now() / 1000;
export const ms = (s: number) => Math.round(s * 1000);
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function newRecord(input: JobInput): FilmRecord {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return {
    ...input,
    id,
    status: "draft",
    stage: "script",
    result: {},
    error: "",
    created: now(),
    project: `${slugify(input.topic).slice(0, 40) || "film"}-${id.slice(0, 4)}`,
    events: [],
    style_label: input.style,
    title: "",
    subtitle: "",
    narrator: {},
    voice_id: "",
    blocks: [],
    assets: {},
    state: {},
  };
}

/* ------------------------------------------------------------------ *\
   Timing

   Unchanged from the original: the cut is decided by the length of the
   narration and of the lip-synced shots, so it can be worked out as
   soon as those files exist.
\* ------------------------------------------------------------------ */

/**
 * Duration of one block in the cut.
 * Standard mode: T = clip duration, V = narration audio duration.
 * Veo mode: both T and V use the clip duration (audio is embedded in the clip).
 */
export const blockDuration = (b: Block, specs: Spec[], veo = false) =>
  b.kind === "T" || veo ? (specs.find((s) => s.shot === b.shot)?.clip?.duration ?? 0) : (b.audio?.duration ?? 0);

export type Cut = { shot: string; start: number; dur: number; talking: boolean };
export type Timeline = { starts: Record<string, number>; segments: Cut[]; pictureEnd: number; total: number };

export function timeline(plan: Plan, specs: Spec[], veo = false): Timeline {
  const blocks = plan.blocks;
  const length: Record<string, number> = Object.fromEntries(blocks.map((b) => [b.id, blockDuration(b, specs, veo)]));

  // In Veo Mode clips are stitched directly — no LEAD/GAP padding.
  // starts[] reflects cumulative clip positions for subtitle timing.
  const starts: Record<string, number> = {};
  if (veo) {
    let t = 0;
    for (const b of blocks) {
      starts[b.id] = t;
      t += length[b.id];
    }
    const tailStart = t;
    const segments: Cut[] = blocks.map((b) => ({
      shot: b.shot,
      start: starts[b.id],
      dur: length[b.id],
      talking: b.kind === "T",
    }));
    const tailDur = specs.find((s) => s.shot === plan.tail.shot)?.clip?.duration || TAIL_DUR;
    segments.push({ shot: plan.tail.shot, start: tailStart, dur: tailDur, talking: false });
    const total = tailStart + tailDur + END_CARD;
    return { starts, segments, pictureEnd: tailStart + tailDur, total };
  }

  // Standard Mode — LEAD + per-block GAP, V blocks stretch to fill the visual gap.
  let t = LEAD;
  for (const b of blocks) {
    starts[b.id] = t;
    t += length[b.id] + GAP;
  }
  const tailStart = blocks[blocks.length - 1].kind === "T" ? t - GAP : t;
  const segments: Cut[] = [];
  let vis = 0;
  blocks.forEach((b, i) => {
    let s0: number, d: number;
    if (b.kind === "T") {
      s0 = starts[b.id];
      d = length[b.id];
    } else {
      const nxt = blocks[i + 1];
      const end = !nxt ? tailStart : starts[nxt.id] - (nxt.kind === "V" ? GAP / 2 : 0);
      s0 = vis;
      d = end - vis;
    }
    segments.push({ shot: b.shot, start: s0, dur: d, talking: b.kind === "T" });
    vis = s0 + d;
  });
  segments.push({ shot: plan.tail.shot, start: tailStart, dur: TAIL_DUR, talking: false });
  return { starts, segments, pictureEnd: tailStart + TAIL_DUR, total: tailStart + TAIL_DUR + END_CARD };
}

/** Length used to order the score, before any shot exists. */
export const filmLength = (plan: Plan, veo = false) =>
  veo
    ? plan.blocks.length * (8 + 0) + TAIL_DUR + END_CARD  // estimate: 8 s avg per clip, no LEAD/GAP in Veo
    : LEAD + sum(plan.blocks.map((b) => (b.audio?.duration ?? 0) + GAP)) + TAIL_DUR + END_CARD;

export const musicLength = (plan: Plan, veo = false) => Math.min(600_000, ms(Math.max(30, filmLength(plan, veo) + 3)));

/** The length to ask a video model for, per shot. */
export function shotNeed(plan: Plan, spec: Spec, index: number, veo = false): number {
  if (spec.bi < 0) return TAIL_DUR;
  const b = plan.blocks[spec.bi];
  // In Veo mode we don't have narration audio yet; use a sensible estimate from word count.
  const dur = veo ? Math.max(5, Math.ceil(b.text.split(/\s+/).length / 2.5) + 0.5) : (b.audio?.duration ?? 0);
  return dur + GAP + (index === 0 ? LEAD : 0);
}

export function buildSpecs(plan: Plan): Spec[] {
  const specs: Spec[] = plan.blocks.map((b, bi) => ({
    shot: b.shot,
    bi,
    scene: b.scene,
    talking: b.kind === "T",
    with_char: Boolean(b.character_in_shot ?? true) || b.kind === "T",
  }));
  specs.push({ shot: plan.tail.shot, bi: -1, scene: plan.tail.scene, talking: false, with_char: true });
  return specs;
}

/** Keeps the specs in step with a script that was edited after they were built. */
export function syncSpecs(plan: Plan, specs: Spec[]): Spec[] {
  const fresh = buildSpecs(plan);
  return fresh.map((f) => {
    const old = specs.find((s) => s.shot === f.shot);
    if (!old) return f;
    const sceneChanged = old.scene !== f.scene && !old.rescened;
    return {
      ...f,
      scene: old.rescened ? old.scene : f.scene,
      rescened: old.rescened,
      plain: old.plain,
      keep_sound: old.keep_sound,
      checked: old.checked,
      key: sceneChanged ? undefined : old.key,
      clip: sceneChanged ? undefined : old.clip,
    };
  });
}

/* ------------------------------------------------------------------ *\
   Subtitle colours
\* ------------------------------------------------------------------ */

const NAMED: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  yellow: [255, 221, 0],
  orange: [255, 150, 30],
  red: [230, 50, 40],
  pink: [255, 110, 170],
  purple: [150, 80, 220],
  blue: [40, 110, 240],
  cyan: [40, 210, 230],
  green: [60, 200, 90],
  magenta: [230, 40, 200],
};

export const namedRgb = (name: string) => NAMED[name] ?? NAMED.yellow;

export function namedColor(hex: string) {
  const h = hex.replace(/^#/, "");
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (h.length < 6 || rgb.some(Number.isNaN)) return "yellow";
  let best = "yellow",
    dist = Infinity;
  for (const [name, c] of Object.entries(NAMED)) {
    if (name === "white") continue;
    const d = sum(c.map((v, i) => (v - rgb[i]) ** 2));
    if (d < dist) [best, dist] = [name, d];
  }
  return best;
}
