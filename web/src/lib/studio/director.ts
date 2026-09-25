import type { AssetInfo } from "./assets";
import { studioData, type StyleFull } from "./data";

/** The model the original pipeline aimed at. Kept so every step can say what it was written for. */
export const DIRECTOR_MODEL = "anthropic/claude-opus-5.5";
export const DIRECTOR_APP = "openrouter/router";
export const VISION_APP = "openrouter/router/vision";

export type Given = { name: string; traits: string; pronoun: string; personality?: string };
export type GivenVoice = { voice_id: string; name?: string; gender?: string; age?: string; accent?: string; description?: string; descriptive?: string };
export type Block = {
  kind: "V" | "T";
  text: string;
  place?: string;
  scene: string;
  character_in_shot: boolean;
  action: string;
  camera: string;
  sound: string;
  id: string;
  shot: string;
  /** The narration file for this block, once it is in the project folder. */
  audio?: AssetInfo;
};
export type Tail = { scene: string; action: string; camera: string; sound: string; shot: string };
export type Plan = {
  title: string;
  subtitle: string;
  slug: string;
  character: { name: string; traits: string; pronoun: string };
  voice_id: string;
  music_prompt: string;
  blocks: Block[];
  tail: Tail;
  continuity?: { rewrites: number; bridges: number };
};

export function shape(minutes: number): [number, number] {
  const n = minutes <= 1 ? 5 : 6 * minutes;
  return [n, Math.max(2, Math.round(n / 3))];
}

export function words(minutes: number): [string, string] {
  return minutes <= 1 ? ["14-22", "16-24"] : ["18-32", "18-30"];
}

export async function languageName(lang: string) {
  return (await studioData()).languages.find((l) => l.code === lang)?.name ?? "English";
}

const quotedList = (xs: string[]) => `[${xs.map((x) => `'${x}'`).join(", ")}]`;

export async function directorSystem(style: StyleFull, minutes: number, lang: string, character?: Given | null, voice?: GivenVoice | null) {
  const { cameras, curated_voices } = await studioData();
  const [n, talk] = shape(minutes);
  let charRule: string;
  if (character) {
    charRule =
      `- The narrator is GIVEN: name "${character.name}", traits "${character.traits}", pronoun "${character.pronoun}". ` +
      'Copy these three values exactly into "character"; place this character naturally in every scene of the style world.';
    if (character.personality)
      charRule += ` Personality: ${character.personality}. Let it shape the voice, the jokes and what ${character.name} notices.`;
  } else {
    charRule = `- The narrator is ONE original character invented for this topic whose design belongs to the style world: ${style.character_hint}. Give it a short, memorable name. "traits" is ONE comma-separated string of 6-8 concrete visual traits (body, colors, material, clothing, one or two props). It must include a clearly visible mouth (needed for lip-sync). This exact string is pasted into every image prompt, so be specific and stable.`;
  }
  const [vw, tw] = words(minutes);
  const voices = Object.entries(curated_voices)
    .map(([vid, desc]) => `- ${vid}: ${desc}`)
    .join("\n");
  let voiceRule: string;
  if (voice) {
    const about = (["gender", "age", "accent", "descriptive"] as const)
      .filter((k) => voice[k])
      .map((k) => String(voice[k]))
      .join(", ");
    voiceRule =
      `- "voice_id": the narrator voice is GIVEN: "${voice.voice_id}" (${voice.name ?? ""}; ${about}; ` +
      `${(voice.description || "").slice(0, 300)}). Copy the id exactly, and make the narrator a character that plausibly has this voice.`;
  } else {
    voiceRule = `- "voice_id": pick the best matching voice for the character from:\n${voices}`;
  }
  const language = await languageName(lang);
  return `You are the director of a short narrated character film. One original character narrates a story that explains a topic to a general audience. Visual style: ${style.label}.
Return ONLY one JSON object, no prose, no markdown fences.

RULES
${charRule}
- Script: exactly ${n} blocks, exactly ${talk} of them "T" (the character talks on camera); the rest are "V" (voice-over under cinematic shots). Block 1 is "V" and the last block is "V". Beyond that the story is yours: structure, tone, jokes, twists and how the character enters are your creative choices.
- Text length: V blocks ${vw} words; T blocks ${tw} words. Language of all narration: ${language}. Spoken rhythm, one idea per block. Facts must be accurate; hedge legends and uncertain claims ("legend says").
- Continuity: the film is one continuous story. Every block grows out of the one before it in place, time and logic. Whenever the setting, the time or the subject changes, the viewer sees or hears how and why we got there; never cut to a new place, companion or subject as if the viewer already knew. How you bridge is up to this story.
- Stay inside the story: never say "this video" and never state how long the film is.
- For every block:
  - "place": a short label of where and when the block happens.
  - "scene": one paragraph (40-80 words) describing the keyframe: setting, era, lighting, composition, props, and what the character is doing. Everything exists in the style world (${style.label}). For T blocks describe the setting and one gesture only; the character faces the camera in a medium close-up, talking.
  - "character_in_shot": true or false (T blocks are always true; at most 2 V blocks may be false).
  - "action": 2-3 short present-tense motion beats for the video, including one small charming or comic beat (V blocks only; "" for T).
  - "camera": one of ${quotedList(cameras)}. Never use a push-in when the character is in shot.
  - "sound": ambient foley for the shot (no music, no speech).
- NEVER put readable text, signs, labels, screens with words, or numbers in any scene. At most ONE block may show one big simple word or year if it is essential; then write "shows only the large letters X" in its scene.
- Describe real people generically (no likeness), no brand logos, no violence or danger to children.
- "tail": the final shot after the last block: the character in a wide shot saying goodbye or resolving the story, with calm open space in the upper third for the title. Give "scene", "action", "camera" (prefer "slow pull-back"), "sound".
${voiceRule}
- "music_prompt": an instrumental score description fitting the style and topic: 3-5 acoustic instruments, mood arc, sparse under narration, a warm swell in the final twenty seconds ending on a soft resolved chord. End with "Acoustic instruments only, no vocals."
- "title": the character's name. "subtitle": a short lowercase phrase starting with "and the ..." (in ${language}). "slug": 3-5 word ascii kebab-case.

JSON SHAPE
{"title": "", "subtitle": "", "slug": "", "character": {"name": "", "traits": "", "pronoun": "his|her|its"}, "voice_id": "", "music_prompt": "",
 "blocks": [{"kind": "V|T", "text": "", "place": "", "scene": "", "character_in_shot": true, "action": "", "camera": "", "sound": ""}],
 "tail": {"scene": "", "action": "", "camera": "", "sound": ""}}`;
}

/* ------------------------------------------------------------------ *\
   Reading an answer that was pasted back by hand
\* ------------------------------------------------------------------ */

/** Accepts a bare JSON object, a fenced block, or an answer with prose around it. */
export function parseJson<T = any>(text: string): T {
  let t = (text ?? "").trim();
  if (!t) throw new Error("Paste the answer first");
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) t = fenced[1];
  const open = t.indexOf("{");
  const close = t.lastIndexOf("}");
  if (open < 0 || close <= open) throw new Error("No JSON object found in that answer");
  try {
    return JSON.parse(t.slice(open, close + 1)) as T;
  } catch (e) {
    throw new Error(`That is not valid JSON: ${e instanceof Error ? e.message : e}`);
  }
}

const str = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";
const text = (x: unknown, fallback = "") => (str(x) ? x.trim() : fallback);

export const slugify = (s: string) =>
  String(s || "film")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "film";

export type PlanReview = { plan: Plan; warnings: string[] };

/** Turns a pasted director answer into a plan, or explains what is missing. */
export async function reviewPlan(raw: any, opts: { minutes: number; character?: Given | null; voice?: GivenVoice | null }): Promise<PlanReview> {
  const { curated_voices, cameras } = await studioData();
  const warnings: string[] = [];
  if (!raw || typeof raw !== "object") throw new Error("The answer is not a JSON object");
  const rawBlocks: any[] = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (!rawBlocks.length) throw new Error('The answer has no "blocks"');
  if (!rawBlocks.every((b) => b?.kind === "V" || b?.kind === "T")) throw new Error('Every block needs "kind": "V" or "T"');
  if (!rawBlocks.every((b) => str(b.text))) throw new Error('Every block needs a "text"');
  if (!rawBlocks.every((b) => str(b.scene))) throw new Error('Every block needs a "scene"');
  if (rawBlocks[0].kind !== "V") throw new Error("The first block must be V (voice-over), because the film opens on a shot without the narrator talking");
  if (!raw.tail || !str(raw.tail.scene)) throw new Error('The answer needs a "tail" with a "scene"');

  const [want, wantTalk] = shape(opts.minutes);
  if (rawBlocks.length !== want) warnings.push(`${rawBlocks.length} blocks instead of ${want}; the film will be about ${rawBlocks.length > want ? "longer" : "shorter"} than ${opts.minutes} min`);
  const talk = rawBlocks.filter((b) => b.kind === "T").length;
  if (talk !== wantTalk) warnings.push(`${talk} on-camera blocks instead of ${wantTalk}`);
  if (rawBlocks[rawBlocks.length - 1].kind !== "V") warnings.push("The last block is on camera; the original always ends on a voice-over");
  const offCamera = rawBlocks.filter((b) => b.kind === "V" && b.character_in_shot === false).length;
  if (offCamera > 2) warnings.push(`${offCamera} blocks leave the narrator out of the shot; the original allows at most 2`);
  const odd = [...new Set(rawBlocks.map((b) => text(b.camera)).filter((c) => c && !cameras.includes(c)))];
  if (odd.length) warnings.push(`Camera moves outside the catalog: ${odd.join(", ")}`);

  const blocks: Block[] = rawBlocks.map((b) => ({
    kind: b.kind,
    text: text(b.text),
    place: text(b.place),
    scene: text(b.scene),
    character_in_shot: b.kind === "T" ? true : b.character_in_shot !== false,
    action: text(b.action),
    camera: text(b.camera, "gentle drift"),
    sound: text(b.sound, "soft ambience"),
    id: "",
    shot: "",
  }));

  const c = opts.character;
  const character = c
    ? { name: c.name, traits: c.traits, pronoun: c.pronoun }
    : { name: text(raw.character?.name, "Narrator"), traits: text(raw.character?.traits), pronoun: text(raw.character?.pronoun, "its") };
  if (!c && !character.traits) throw new Error('The answer needs "character.traits": one comma-separated line of visual traits, used in every image prompt');

  let voice_id = opts.voice?.voice_id || text(raw.voice_id);
  if (!voice_id) {
    voice_id = Object.keys(curated_voices)[0];
    warnings.push(`No voice in the answer; using ${voice_id}`);
  } else if (!opts.voice && !(voice_id in curated_voices)) {
    // The original forced the answer back onto its own list. Here the id is only
    // a label you carry to your own service, so an unknown one is worth a word, not a swap.
    warnings.push(`Voice "${voice_id}" is not one the catalog knows; it is passed through as written`);
  }

  const title = text(raw.title, character.name);
  const plan: Plan = {
    title,
    subtitle: text(raw.subtitle),
    slug: slugify(text(raw.slug, title)),
    character,
    voice_id,
    music_prompt: text(raw.music_prompt, "Sparse acoustic score, warm and curious. Acoustic instruments only, no vocals."),
    blocks,
    tail: {
      scene: text(raw.tail.scene),
      action: text(raw.tail.action, "The character waves goodbye as the scene settles."),
      camera: text(raw.tail.camera, "slow pull-back"),
      sound: text(raw.tail.sound, "soft ambience"),
      shot: "",
    },
  };
  if (!plan.music_prompt) warnings.push('No "music_prompt" in the answer');
  return { plan, warnings };
}

/** B01, B02 … for the blocks and S/T shot names, exactly as the original numbered them. */
export function numberPlan(plan: Plan): Plan {
  plan.blocks.forEach((b, i) => {
    const n = String(i + 1).padStart(2, "0");
    b.id = `B${n}`;
    b.shot = (b.kind === "T" ? "T" : "S") + n;
  });
  plan.tail.shot = `S${String(plan.blocks.length + 1).padStart(2, "0")}`;
  return plan;
}

/* ------------------------------------------------------------------ *\
   Script editor pass
\* ------------------------------------------------------------------ */

export const CONTINUITY_SYSTEM = "You are the script editor of a short narrated character film. You protect the viewer's sense of flow. Return ONLY JSON.";

export const mostInserts = (blocks: number) => Math.max(1, Math.min(Math.floor(blocks / 5), 64 - blocks));

export const continuityScript = (blocks: Block[]) =>
  JSON.stringify(blocks.map((b, index) => ({ index, kind: b.kind, place: b.place ?? "", text: b.text ?? "", scene: b.scene ?? "" })));

export async function continuityPrompt(script: string, minutes: number, lang: string, most: number) {
  const { cameras } = await studioData();
  const [vw, tw] = words(minutes);
  return (
    "Here is the script as blocks (kind V = voice-over, T = the narrator talks on camera).\n" +
    "Watch it in your head as a first-time viewer who only sees and hears what is on screen. Wherever the film jumps (a new place, time, " +
    'subject or companion appears) and that viewer would ask "wait, how did we get here?" or "why are we talking about this now?", ' +
    "repair the flow so every block grows out of the one before. How you bridge is your choice and should fit this particular story. " +
    `You may rewrite the text and scene of the blocks around a jump, and you may insert up to ${most} new V blocks where the story needs a ` +
    "moment to travel or explain. Leave blocks that already flow untouched. Keep the narration language " +
    `(${await languageName(lang)}), the narrator, the facts, ${vw} words for V and ${tw} words for T blocks, and no readable text in scenes.\n` +
    `SCRIPT: ${script}\n` +
    'Return {"edits": [{"index": 0, "text": "", "scene": "", "place": ""}], ' +
    '"inserts": [{"after": 0, "text": "", "place": "", "scene": "", "character_in_shot": true, "action": "", "camera": "", "sound": ""}]} ' +
    `("camera" one of ${quotedList(cameras)}). Use empty lists when the script already flows.`
  );
}

/** Applies a pasted script-editor answer. Anything malformed is ignored, exactly as the original did. */
export function applyContinuity(blocks: Block[], r: any, most: number): { blocks: Block[]; rewrites: number; bridges: number } {
  const out = blocks.map((b) => ({ ...b }));
  let rewrites = 0;
  for (const e of r?.edits ?? []) {
    const i = e?.index;
    if (!Number.isInteger(i) || i < 0 || i >= out.length) continue;
    let touched = false;
    for (const k of ["text", "scene", "place"] as const)
      if (str(e[k]) && out[i][k] !== e[k].trim()) {
        out[i][k] = e[k].trim();
        touched = true;
      }
    if (touched) rewrites++;
  }
  const inserts = (r?.inserts ?? [])
    .filter((x: any) => Number.isInteger(x?.after) && x.after >= 0 && x.after < blocks.length && str(x.text) && str(x.scene))
    .slice(0, most)
    .sort((a: { after: number }, b: { after: number }) => b.after - a.after);
  for (const x of inserts)
    out.splice(x.after + 1, 0, {
      kind: "V",
      text: text(x.text),
      place: text(x.place),
      scene: text(x.scene),
      character_in_shot: x.character_in_shot !== false,
      action: text(x.action, "The character moves on through the scene."),
      camera: text(x.camera, "gentle drift"),
      sound: text(x.sound, "soft ambience"),
      id: "",
      shot: "",
    });
  return { blocks: out, rewrites, bridges: inserts.length };
}

/* ------------------------------------------------------------------ *\
   Smaller asks
\* ------------------------------------------------------------------ */

export const RESIZE_SYSTEM = "You edit narration lines. Return ONLY JSON.";

export function resizePrompt(text: string, seconds: string, want: string, language: string) {
  return `This talking line lasts ${seconds} s when spoken; it must last 6-12 s. Make it ${want}, keep the meaning, language ${language}. Line: "${text}"\nReturn {"text": "..."}`;
}

export async function resizeAsk(line: string, seconds: number, lang: string) {
  return resizePrompt(line, seconds.toFixed(1), seconds > 12 ? "shorter" : "longer", await languageName(lang));
}

export const REPHRASE_SYSTEM = "You rewrite image prompts that were rejected by a safety filter. Return ONLY JSON.";

export function rephrasePrompt(scene: string) {
  return (
    "Rewrite this scene so it keeps the story meaning but avoids anything a strict filter could flag " +
    "(real names, brands, danger, weapons, crowds panicking). " +
    `Scene: "${scene}"\nReturn {"scene": "..."}`
  );
}

export type DescribedStyle = { label?: string; anchor: string; motion: string; character_hint?: string; palette: { bg: string; text: string; accent: string } };

export const STYLE_SYSTEM = "You are an art director. You describe illustration styles so an image model can reproduce them. Return ONLY JSON.";
export const STYLE_PROMPT =
  "Describe ONLY the art style of this image (medium, line quality, texture, lighting, palette, rendering), never its content. Return JSON: " +
  '{"label": "2-4 word style name", ' +
  '"anchor": "one sentence starting like \'<Style> film still: ...\' listing medium, linework, texture, lighting, palette, ending with \'widescreen 16:9 composition.\'", ' +
  '"motion": "one sentence describing how this style looks when animated", ' +
  '"character_hint": "what kind of narrator character fits this style world", ' +
  '"palette": {"bg": "#dark hex from the image", "text": "#light hex", "accent": "#accent hex"}}';

export function reviewStyle(raw: any): DescribedStyle {
  if (!str(raw?.anchor)) throw new Error('The answer needs an "anchor": the sentence pasted into every image prompt');
  return {
    label: text(raw.label, "Custom style"),
    anchor: text(raw.anchor),
    motion: text(raw.motion, "The illustration moves with gentle, hand-made motion."),
    character_hint: text(raw.character_hint, "an original narrator that belongs to this world"),
    palette: {
      bg: text(raw.palette?.bg, "#141414"),
      text: text(raw.palette?.text, "#f6f1e8"),
      accent: text(raw.palette?.accent, "#f0a45a"),
    },
  };
}

export const CHARACTER_SYSTEM = "You are a character designer writing a model-sheet description. Return ONLY JSON.";

export function characterDescribePrompt(name: string) {
  const given = name ? `The character's name is "${name}". ` : "Invent a short, memorable name that fits it. ";
  return (
    `${given}Describe the character in this image so an image model can redraw it identically in new scenes. ` +
    'Return JSON {"name": "...", "traits": "ONE comma-separated string of 6-9 concrete visual traits: body shape, colors, materials, ' +
    'face (eyes, mouth), clothing, props", "pronoun": "his|her|its"}. Mention the mouth. Do not mention the background or the art style.'
  );
}

export function reviewCharacter(raw: any, name = ""): Given {
  if (!str(raw?.traits)) throw new Error('The answer needs "traits": one comma-separated line of visual traits');
  return { name: name || text(raw.name, "Narrator"), traits: text(raw.traits), pronoun: text(raw.pronoun, "its") };
}
