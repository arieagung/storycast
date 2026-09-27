import type { AssetInfo } from "./assets";
import { studioData, type StyleFull } from "./data";

/** The model the original pipeline aimed at. Kept so every step can say what it was written for. */
export const DIRECTOR_MODEL = "anthropic/claude-opus-5.5";
export const DIRECTOR_APP = "openrouter/router";
export const VISION_APP = "openrouter/router/vision";

export type Given = { name: string; traits: string; pronoun: string; personality?: string; tag?: string };
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
export type Tail = {
  scene: string;
  action: string;
  camera: string;
  sound: string;
  shot: string;
  /** The film's last spoken words, said off-screen over the closing shot. Missing on old plans. */
  text?: string;
  /** Standard Mode: the recording of that line (narration/tail.*). */
  audio?: AssetInfo;
};
export type Plan = {
  title: string;
  subtitle: string;
  slug: string;
  /** tag: 2-4 generic English words, e.g. "the felt bear"; image and video prompts say "NAME, TAG" instead of repeating the traits. */
  character: { name: string; traits: string; pronoun: string; tag?: string };
  voice_id: string;
  /** Veo Mode only: one English sentence describing the narrator's voice, repeated in every shot prompt. */
  voice_desc?: string;
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

/* ------------------------------------------------------------------ *\
   Title and native narration
\* ------------------------------------------------------------------ */

/**
 * The title competes for a click next to other videos, so it is written for that, not as a label.
 * Title and subtitle are shown together ("TITLE subtitle") and hand-lettered on the end card.
 */
export function titleRule(language: string) {
  return (
    `- "title" and "subtitle" (in ${language}): together they are the video's title on a platform like YouTube, where it competes with many other videos for one click. ` +
    "The goal: someone scrolling past can't resist opening it, and someone searching for this topic finds it. It must feel made for this topic alone, so it should never be predictable or interchangeable with another topic's title " +
    "(a narrator-name-plus-topic label is exactly what we don't want; nobody searches for the narrator). The film must deliver what the title promises. " +
    'The "subtitle" is the second line under the title on the end card and adds something the title does not say yet.\n' +
    '- The opening of block 1 immediately picks up the title\'s promise, so a viewer who clicked stays.'
  );
}

/** The tail line is said over one short closing shot, so it stays brief. */
export const TAIL_WORDS = 14;

/**
 * Why viewers leave differs by length: a short is judged in its first seconds, a longer film
 * loses people between sections. The rule states the goal; the director decides the structure.
 */
export function retentionRule(minutes: number) {
  return minutes <= 1
    ? "- Retention (short video): viewers of short videos decide within the first three seconds whether to keep watching or swipe away, and a film that loses that moment is never seen. " +
        "So the opening image and the first words of block 1 must win it on their own, and the scenes are ordered for a short, not as a slow build; every following block has to keep earning the next seconds."
    : "- Retention (longer video): viewers of longer videos drift away wherever the film feels finished for now. " +
        "Shape the story in sections, each ending on an open question, a surprise or a cliffhanger that makes the next section feel necessary, with the full payoff saved for the end; the opening still has to hook within the first seconds.";
}

/**
 * Asks for narration that sounds native rather than translated. Returns "" for English.
 */
export function nativeRule(language: string) {
  if (language === "English") return "";
  return (
    `- Native ${language}: every "text", "title" and "subtitle" must sound as if a native ${language} storyteller wrote and spoke it, not like a translation or a textbook. ` +
    `A native listener should notice nothing odd in the sentence structure or word choice; the language should feel as natural and warm as good ${language} content made for a wide audience.`
  );
}

/* ------------------------------------------------------------------ *\
   Storytelling style

   Chosen separately from the character: the character sets the look and
   the voice, the storytelling style sets tone and structure. The
   character's personality only reaches the script when asked for.
\* ------------------------------------------------------------------ */

export type NarrativeId = "auto" | "documentary" | "bedtime" | "adventure" | "comedic" | "mystery" | "legend" | "personality" | "custom";
export type Narrative = { id: NarrativeId; text?: string };

export const NARRATIVES: { id: NarrativeId; label: string; blurb: string; rule?: string }[] = [
  { id: "auto", label: "Auto", blurb: "The director picks the approach that fits the topic best" },
  {
    id: "documentary",
    label: "Natural documentary",
    blurb: "Real places and things, warm and informative",
    rule: "a nature-documentary tone: warm, calm, curious and informative. The narrator guides the viewer through the real subject and lets the wonder of the facts carry the film.",
  },
  {
    id: "bedtime",
    label: "Bedtime story",
    blurb: "Slow, gentle, a soothing ending",
    rule: "a bedtime story: slow gentle rhythm, soft images and simple words, small cosy moments of wonder, no tension or scares, and a quiet soothing ending.",
  },
  {
    id: "adventure",
    label: "Adventure",
    blurb: "A journey, curiosity and small challenges",
    rule: "an adventure: the narrator travels through the real world of the topic, meets small obstacles and discoveries along the way, and each fact is earned as a step of the journey.",
  },
  {
    id: "comedic",
    label: "Comedic",
    blurb: "Light and full of jokes, facts stay accurate",
    rule: "a light comedy: playful timing, gentle running jokes and funny reactions from the narrator, while every fact stays accurate and clear.",
  },
  {
    id: "mystery",
    label: "Mystery",
    blurb: "Opens with a question, the answer unfolds",
    rule: "a mystery: open with an intriguing question, gather clues from the real subject block by block, and reveal the full answer near the end.",
  },
  {
    id: "legend",
    label: "Legend / epic",
    blurb: "Told like a grand tale or great history",
    rule: "a legend or epic: a grand, storyteller's voice, sweeping images and a sense of deep time, while real facts stay clearly separated from myth.",
  },
  { id: "personality", label: "Character's personality", blurb: "The narrator's own personality shapes the story" },
  { id: "custom", label: "Custom", blurb: "Describe the storytelling style yourself" },
];

export const narrativeLabel = (n?: Narrative | null) => NARRATIVES.find((x) => x.id === (n?.id ?? "auto"))?.label ?? "Auto";

function storyRules(character: Given | null | undefined, narrative: Narrative | null | undefined): string {
  const id = narrative?.id ?? "auto";
  if (id === "personality") {
    // The original behaviour: the character's personality shapes the whole film.
    return character?.personality
      ? `- Personality: ${character.personality}. Let it shape the voice, the jokes and what ${character.name} notices.`
      : "";
  }
  const preset = NARRATIVES.find((x) => x.id === id);
  const custom = id === "custom" ? (narrative?.text ?? "").trim().replace(/[.\s]+$/, "") : "";
  const story = custom
    ? `- Storytelling style: ${custom}. Keep this style consistent across the whole film.`
    : preset?.rule
      ? `- Storytelling style: ${preset.rule}`
      : "- Storytelling style: choose the approach that best fits this topic and a general audience (for example documentary, adventure, bedtime story, gentle comedy, mystery or legend) and keep it consistent across the whole film.";
  return `${story}\n${SUBJECT_RULE}`;
}

/**
 * Applies to every storytelling style: the scenes are where the film explains things, so they have
 * to be rich and varied, not the narrator standing in front of the subject block after block.
 */
function visualRule(style: StyleFull) {
  return (
    `- Visual storytelling: the pictures do the explaining. For every V block, paint the single most vivid image that shows what that line says, as an illustration in the ${style.label} style: ` +
    "go inside, underneath, up close or far above; use cutaways and cross-sections (the magma chamber under a volcano, the inside of a beehive), macro details, aerial views, " +
    "moments from the past, before/after, cause and effect, scale comparisons, and the process itself in mid-action. " +
    "Vary the subject, the shot scale and the composition from block to block; never repeat the same framing twice in a row, and never make the film a series of the narrator standing in front of the subject. " +
    "Explanatory cutaways need no travel bridge: the narration carries the link, while scenes with the narrator keep the story's place and time coherent.\n" +
    "- Energy: the viewer should never feel they are watching a presenter talk in front of a backdrop. The film should feel like a lively animated film that holds attention from the first seconds to the end, " +
    "with every shot giving a reason to keep watching and the narrator living the story rather than reporting it, including while talking on camera."
  );
}

/** Keeps the character's hobby or job from replacing the topic with props; dropped when the personality is asked for. */
const SUBJECT_RULE =
  "- Subject: show the topic itself, never a stand-in for it: no models, toys, dioramas or props of the subject, and no move into the narrator's home, lab or workshop, unless the topic or the chosen storytelling style calls for it. " +
  "The narrator's own hobbies or profession never decide the settings.";

export async function directorSystem(style: StyleFull, minutes: number, lang: string, character?: Given | null, voice?: GivenVoice | null, veo = false, narrative?: Narrative | null) {
  const { cameras, curated_voices } = await studioData();
  const [n, talk] = shape(minutes);
  let charRule: string;
  if (character) {
    charRule =
      `- The narrator is GIVEN: name "${character.name}", traits "${character.traits}", pronoun "${character.pronoun}". ` +
      'Copy these three values exactly into "character"; whenever the narrator is in shot, place this character naturally in the style world.';
  } else {
    charRule = `- The narrator is ONE original character invented for this topic whose design belongs to the style world: ${style.character_hint}. Give it a short, memorable name. "traits" is ONE comma-separated string of 6-8 concrete visual traits (body, colors, material, clothing, one or two props). It must include a clearly visible mouth (needed for lip-sync). This exact string draws the model sheet and hero portrait that every later image copies, so be specific and stable.`;
  }
  const [vw, tw] = words(minutes);
  const voices = Object.entries(curated_voices)
    .map(([vid, desc]) => `- ${vid}: ${desc}`)
    .join("\n");
  let voiceRule = "";
  if (!veo) {
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
  }
  const language = await languageName(lang);
  // Veo generates the voice itself, so the voice is described once here and repeated verbatim in every shot.
  const tagRule =
    `- "character.tag": 2-4 plain generic English words saying what the narrator is, starting with "the" (e.g. "the felt bear"). ` +
    "No brand, trademark or franchise words, no colors or clothing. Image and video prompts introduce the narrator as NAME, TAG next to the model-sheet images, so the tag says only what the narrator is, never how it looks.";
  const voiceDescRule = veo
    ? `- "voice_desc": ONE English sentence describing the narrator's speaking voice for a video model that generates the audio itself: ` +
      `gender, age, timbre, pace and tone that fit this character, ` +
      `and an accent that sounds natural for a native ${language} speaker. Never name a real person, voice actor or voice id. ` +
      "This exact sentence is repeated in every shot so the voice stays identical across clips, so make it specific and stable."
    : "";
  return `You are the director of a short narrated character film. One original character narrates a story that explains a topic to a general audience. Visual style: ${style.label}.
Return ONLY one JSON object, no prose, no markdown fences.

RULES
${[charRule, storyRules(character, narrative), visualRule(style)].filter(Boolean).join("\n")}
- Script: exactly ${n} blocks, exactly ${talk} of them "T" (the character talks on camera); the rest are "V" (voice-over under cinematic shots). Block 1 is "V" and the last block is "V". Beyond that the story is yours: structure, tone, jokes, twists and how the character enters are your creative choices.
${retentionRule(minutes)}
- Ending: the last block closes the explanation: its "text" sums up the answer to the topic in plain words and adds no new facts. Its "scene" leads straight into the place of the "tail". The "tail" is the last thing the viewer sees and hears, so its "text" carries the film's final spoken words: the line people remember and take away, fitting the storytelling style. It is spoken off-screen over a short closing shot, so it has to land in a few seconds (at most ${TAIL_WORDS} words).
- Text length: V blocks ${vw} words; T blocks ${tw} words. Language of all narration: ${language}. Spoken rhythm, one idea per block. Facts must be accurate; hedge legends and uncertain claims ("legend says").
- Continuity (story): the film is one continuous story. Every block grows out of the one before it in place, time and logic. Whenever the setting, the time or the subject changes, the viewer sees or hears how and why we got there; never cut to a new place, companion or subject as if the viewer already knew. How you bridge is up to this story.
- Continuity (picture), CRITICAL: every "scene" is painted by an image model that has never seen the other shots, so continuity only exists if you write it into every scene. Before writing the blocks, settle the recurring sets, props and companions of the film and one fixed wording for each (material, color, shape, position). Every time one of them appears, including in the "tail", describe it again in full with exactly the same words, never with back-references like "the same tree as before".
- State continuity, CRITICAL: track the state of every recurring set and prop from block to block. Once the story changes something (a hollow filled with honeycomb, a cell capped with wax, a seed sprouted, a door opened, day turned to evening), every later scene that shows it describes the changed state explicitly; nothing silently reverts, empties or disappears unless the story says so. The time of day, weather and season only change when the story moves them. The "tail" shows the latest state of everything in it. Example: if one scene shows a tree hollow hung with pale ivory honeycomb, every later scene with that tree says the hollow is hung with pale ivory honeycomb.
- Stay inside the story: never say "this video" and never state how long the film is.
- LANGUAGE RULE: "text" (narration) must be in ${language}. "tail.text" is narration too, in ${language}. All other fields — "place", "scene", "action", "sound", "music_prompt", and the other "tail" fields — must be written IN ENGLISH regardless of the narration language. "title" and "subtitle" are in ${language}.
${nativeRule(language)}
- For every block:
  - "place": a short English label of where and when the block happens.
  - "scene": one paragraph (40-80 words) IN ENGLISH describing the keyframe: what the image shows and explains, setting, era, lighting, composition, props, and, when the narrator is in shot, what the character is doing. Everything exists in the style world (${style.label}). For T blocks the narrator's face and mouth must be clearly visible to the camera, because the line is lip-synced; everything else about the shot is yours. Write only what is visible in this single frame — never reference "the same table as before" or any other shot; describe what the image model will see as its only input. Call the narrator by name only and never describe the narrator's look (body, fur, colors, clothing, accessories): the model-sheet images already define it, and repeating traits makes the image model redraw them differently. When "character_in_shot" is false, no character, person or creature resembling the narrator appears.
  - "character_in_shot": T blocks are always true. For V blocks decide per shot what serves the explanation best: true when the narrator adds something to the picture (reacting, pointing, discovering, interacting, giving scale), false when the subject should fill the frame (cutaways, cross-sections, close-ups, processes, the past). A good film mixes both.
  - "action": ${
    veo
      ? "IN ENGLISH, what moves in the video: for V blocks 2-3 short present-tense motion beats (with the narrator in shot, include one small charming or comic beat; without, show the subject itself in motion: magma rising, cells dividing, a wave forming); for T blocks what the narrator does while talking. The video model starts from the keyframe, so describe only movement and change: call the narrator by name only and never describe again how the character, the set or the lighting look."
      : 'IN ENGLISH, 2-3 short present-tense motion beats for the video (with the narrator in shot, include one small charming or comic beat; without, show the subject itself in motion) (V blocks only; "" for T).'
  }
  - "camera": one of ${quotedList(cameras)}. Never use a push-in when the character is in shot.
  - "sound": ambient foley IN ENGLISH for the shot (no music, no speech).
- NEVER put readable text, signs, labels, screens with words, or numbers in any scene. At most ONE block may show one big simple word or year if it is essential; then write "shows only the large letters X" in its scene.
- Avoid anything a strict filter could flag (real names, brands, danger, weapons, crowds panicking). Describe real people generically (no likeness), no brand logos, no violence or danger to children. In every field, never use brand names, trademarks, franchise or famous-character names, or words closely tied to them (write "felt bear", not "teddy bear").
- "tail": the final shot after the last block: the character in a wide shot saying goodbye or resolving the story, with calm open space in the upper third for the title. Its "scene" returns to a place of the story and repeats the fixed wording and the latest state of every set and prop it shows. Give "text" (the closing line, in ${language}), and "scene", "action", "camera" (prefer "slow pull-back"), "sound" IN ENGLISH.
${tagRule}
${veo ? voiceDescRule : voiceRule}
- "music_prompt": an instrumental score description fitting the style and topic: 3-5 acoustic instruments, mood arc, sparse under narration, a warm swell in the final twenty seconds ending on a soft resolved chord. End with "Acoustic instruments only, no vocals."
${titleRule(language)}
- "slug": 3-5 word ascii kebab-case from the title's keywords.

JSON SHAPE
{"title": "", "subtitle": "", "slug": "", "character": {"name": "", "traits": "", "pronoun": "his|her|its", "tag": ""}, ${veo ? '"voice_desc": "", ' : '"voice_id": "", '}"music_prompt": "",
 "blocks": [{"kind": "V|T", "text": "", "place": "", "scene": "", "character_in_shot": true, "action": "", "camera": "", "sound": ""}],
 "tail": {"text": "", "scene": "", "action": "", "camera": "", "sound": ""}}`;
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
export async function reviewPlan(raw: any, opts: { minutes: number; character?: Given | null; voice?: GivenVoice | null; veo?: boolean }): Promise<PlanReview> {
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

  let voice_id = "";
  if (!opts.veo) {
    voice_id = opts.voice?.voice_id || text(raw.voice_id);
    if (!voice_id) {
      voice_id = Object.keys(curated_voices)[0];
      warnings.push(`No voice in the answer; using ${voice_id}`);
    } else if (!opts.voice && !(voice_id in curated_voices)) {
      // The original forced the answer back onto its own list. Here the id is only
      // a label you carry to your own service, so an unknown one is worth a word, not a swap.
      warnings.push(`Voice "${voice_id}" is not one the catalog knows; it is passed through as written`);
    }
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
  const closing = text(raw.tail.text);
  if (closing) plan.tail.text = closing;
  else warnings.push('No "tail.text" in the answer; the closing shot has no spoken line');
  const tag = text(raw.character?.tag).replace(/[.\s]+$/, "");
  if (tag) plan.character.tag = tag;
  else warnings.push('No "character.tag" in the answer; prompts name the narrator without a short description');
  if (opts.veo) {
    const desc = text(raw.voice_desc);
    if (desc) plan.voice_desc = desc.replace(/[.\s]+$/, "") + ".";
    else warnings.push('No "voice_desc" in the answer; shot prompts fall back to a description built from the chosen voice');
  }
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

/** The blocks, plus the tail (index "tail") so its scene is checked for continuity too. */
export const continuityScript = (blocks: Block[], tail?: Pick<Tail, "scene" | "text"> | null) =>
  JSON.stringify([
    ...blocks.map((b, index) => ({ index, kind: b.kind, place: b.place ?? "", text: b.text ?? "", scene: b.scene ?? "" })),
    ...(tail ? [{ index: "tail", kind: "tail", place: "", text: tail.text ?? "", scene: tail.scene ?? "" }] : []),
  ]);

export async function continuityPrompt(script: string, minutes: number, lang: string, most: number) {
  const { cameras } = await studioData();
  const [vw, tw] = words(minutes);
  const language = await languageName(lang);
  const native = nativeRule(language);
  return (
    "Here is the script as blocks (kind V = voice-over, T = the narrator talks on camera).\n" +
    "Watch it in your head as a first-time viewer who only sees and hears what is on screen. Wherever the film jumps (a new place, time, " +
    'subject or companion appears) and that viewer would ask "wait, how did we get here?" or "why are we talking about this now?", ' +
    "repair the flow so every block grows out of the one before. How you bridge is your choice and should fit this particular story. " +
    `You may rewrite the text and scene of the blocks around a jump, and you may insert up to ${most} new V blocks where the story needs a ` +
    "moment to travel or explain. Leave blocks that already flow untouched. " +
    "Then check the picture continuity across ALL scenes, including the tail (index \"tail\", the wide goodbye shot after the last block). Every scene is painted by an image model that " +
    "never sees the other shots, so: (1) every recurring set, prop or companion uses the same concrete wording (material, color, shape, position) each time it appears; " +
    "(2) its state follows the story: once something has changed (filled, built, capped, grown, opened, moved, day turned to evening), every later scene that shows it states the " +
    "changed state explicitly, and nothing silently reverts, empties or disappears (if a tree hollow was hung with honeycomb, later scenes of that tree still say so); " +
    "(3) scenes call the narrator by name only and never describe the narrator's look; " +
    "(4) no stretch of the film feels static or repetitive to watch. Rewrite every scene that breaks one of these. " +
    "Check that the film keeps the viewer watching as this rule asks, and rewrite what does not:\n" +
    `${retentionRule(minutes)}\n` +
    "Finally check the ending: the last block closes the explanation, summing up the answer to the topic with no new facts (rewrite its text if it is just one more fact), " +
    `and the tail's "text" is the film's final spoken line, the one the viewer remembers (at most ${TAIL_WORDS} words, in ${language}); write or rewrite it if it is missing or weak. ` +
    `Keep "text" (narration) in ${language}. Keep "scene", "place", "action", "sound" IN ENGLISH. ` +
    (native
      ? `Rewrite any "text" that does not meet this, keeping its facts and length:\n${native}\n`
      : "") +
    "Every scene you write or rewrite must be self-contained: describe recurring sets and props in full, never with back-references like \"the same table\". " +
    `Keep the narrator, the facts, ${vw} words for V and ${tw} words for T blocks, no readable text in scenes, and avoid anything a strict filter could flag (real names, brands, danger, weapons, crowds panicking).\n` +
    `SCRIPT: ${script}\n` +
    'Return {"edits": [{"index": 0, "text": "", "scene": "", "place": ""}], "tail": {"text": "", "scene": ""}, ' +
    '"inserts": [{"after": 0, "text": "", "place": "", "scene": "", "character_in_shot": true, "action": "", "camera": "", "sound": ""}]} ' +
    `("camera" one of ${quotedList(cameras)}; fill "tail" fields only when they need a rewrite, otherwise leave them ""). Use empty lists when the script already flows.`
  );
}

/** Applies a pasted script-editor answer. Anything malformed is ignored, exactly as the original did. */
export function applyContinuity(
  blocks: Block[],
  r: any,
  most: number,
  tail?: Tail,
): { blocks: Block[]; rewrites: number; bridges: number; tail?: Tail } {
  const out = blocks.map((b) => ({ ...b }));
  let rewrites = 0;
  let newTail = tail;
  // The tail may come back as "tail": {"scene", "text"} or as an edit with index "tail".
  const tailEdits = [r?.tail, ...(r?.edits ?? []).filter((e: any) => e?.index === "tail")];
  const tailScene = tailEdits.map((e: any) => e?.scene).find(str);
  const tailText = tailEdits.map((e: any) => e?.text).find(str);
  if (tail) {
    let touched = false;
    if (tailScene && tailScene.trim() !== tail.scene) {
      newTail = { ...newTail!, scene: tailScene.trim() };
      touched = true;
    }
    if (tailText && tailText.trim() !== (tail.text ?? "")) {
      newTail = { ...newTail!, text: tailText.trim() };
      touched = true;
    }
    if (touched) rewrites++;
  }
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
  return { blocks: out, rewrites, bridges: inserts.length, tail: newTail };
}

/* ------------------------------------------------------------------ *\
   Smaller asks
\* ------------------------------------------------------------------ */

export const RESIZE_SYSTEM = "You edit narration lines. Return ONLY JSON.";

export function resizePrompt(text: string, seconds: string, want: string, language: string) {
  return `This talking line lasts ${seconds} s when spoken; it must last 6-12 s. Make it ${want}, keep the meaning, language ${language}. It should sound like a native ${language} speaker said it, not a translation. Line: "${text}"\nReturn {"text": "..."}`;
}

export async function resizeAsk(line: string, seconds: number, lang: string) {
  return resizePrompt(line, seconds.toFixed(1), seconds > 12 ? "shorter" : "longer", await languageName(lang));
}

export const REPHRASE_SYSTEM = "You rewrite image prompts that were rejected by a safety filter. Return ONLY JSON.";

export function rephrasePrompt(scene: string) {
  return (
    "Rewrite this scene so it keeps the story meaning but avoids anything a strict filter could flag " +
    "(real names, brands, danger, weapons, crowds panicking). " +
    'Write the new scene in English and keep it self-contained: describe every set and prop in full, never refer to other shots. ' +
    `Scene: "${scene}"\nReturn {"scene": "..."}`
  );
}

export type DescribedStyle = { label?: string; anchor: string; motion: string; character_hint?: string; palette: { bg: string; text: string; accent: string } };

export const STYLE_SYSTEM = "You are an art director. You describe illustration styles so an image model can reproduce them. Return ONLY JSON.";

export function stylePrompt(_veo = false) {
  return (
    "Describe ONLY the art style of this image (medium, line quality, texture, lighting, palette, rendering), never its content. Return JSON: " +
    '{"label": "2-4 word style name", ' +
    '"anchor": "one sentence starting like \'<Style> film still: ...\' listing medium, linework, texture, lighting, palette", ' +
    '"motion": "one sentence describing how this style looks when animated", ' +
    '"character_hint": "what kind of narrator character fits this style world", ' +
    '"palette": {"bg": "#dark hex from the image", "text": "#light hex", "accent": "#accent hex"}}'
  );
}

export const STYLE_PROMPT = stylePrompt(false);

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
