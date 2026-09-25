import type { Voice, VoiceFacets, VoicePage, VoiceQuery } from "@/lib/api";
import { studioData, seedCache } from "./data";
import { cacheGet } from "./store";
import { SHARE_API } from "@/lib/share";

export const PREVIEW_LINE = "Hi! I'm your narrator. Sit back, and let me tell you a story you won't forget.";
export const TOPIC_LINE = "Hi, I'm your narrator. Today's story: {topic}.";

const EMPTY_FACETS: VoiceFacets = { total: 0, gender: [], age: [], accent: [], category: [], tags: [], languages: [] };

async function voiceApi<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${SHARE_API}${path}?${new URLSearchParams(params)}`, { signal });
  if (!r.ok) throw new Error(`voices unavailable (${r.status})`);
  return r.json();
}

let facetCache: Promise<VoiceFacets> | null = null;
export function facets(): Promise<VoiceFacets> {
  if (!SHARE_API) return Promise.resolve(EMPTY_FACETS);
  facetCache ??= voiceApi<VoiceFacets>("/api/voices/facets", {}).catch((e) => {
    facetCache = null;
    throw e;
  });
  return facetCache;
}

export async function search(q: VoiceQuery, page = 0, signal?: AbortSignal): Promise<VoicePage> {
  if (!SHARE_API) return { voices: [], total_count: 0, has_more: false };
  return voiceApi<VoicePage>("/api/voices", { q: JSON.stringify(q), page: String(page) }, signal);
}

/** The voices the catalog ships with, as a list the picker can show without any service behind it. */
export async function curated(): Promise<Voice[]> {
  const { curated_voices } = await studioData();
  return Object.entries(curated_voices).map(([voice_id, blurb]) => {
    const [name, ...rest] = String(blurb).split(":");
    return {
      voice_id,
      name: name.trim(),
      description: rest.join(":").trim(),
      preview_url: "",
      category: "curated",
      tags: [],
      short: rest.join(":").trim(),
      gender: "",
      age: "",
      accent: "",
      collections: 0,
      curated: true,
    } satisfies Voice;
  });
}

export async function line(template: string, lang: string): Promise<string> {
  if (lang === "en") return template;
  const key = `${lang}|${template}`;
  return cacheGet("lines", key) ?? (await seedCache()).lines[key] ?? template;
}

/* ------------------------------------------------------------------ *\
   Samples

   The original spoke a line through fal whenever it wanted to audition a
   voice. Nothing here can make audio, so a sample only plays when the
   catalog already ships one for that exact line.
\* ------------------------------------------------------------------ */

const NO_SAMPLE = "No sample for this one. Hear the voice in whichever text-to-speech service you use.";

async function sampleKey(voiceId: string, lang: string, text: string) {
  const bytes = new TextEncoder().encode(`${voiceId}|${lang}|${text}`);
  const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-1", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 16);
}

export async function sample(voiceId: string, text: string, lang = "en"): Promise<string> {
  const clean = Array.from(text.split(/\s+/).filter(Boolean).join(" ")).slice(0, 320).join("");
  const key = await sampleKey(voiceId, lang, clean);
  const hit = cacheGet("samples", key) ?? (await seedCache()).samples[key];
  if (!hit) throw new Error(NO_SAMPLE);
  return hit;
}

export async function audition(voiceId: string, topic: string, lang: string) {
  const text = topic.trim() ? (await line(TOPIC_LINE, lang)).replace("{topic}", topic.trim().slice(0, 160)) : await line(PREVIEW_LINE, lang);
  return sample(voiceId, text, lang);
}

export async function characterIntro(characterId: string, lang: string) {
  const c = (await studioData()).characters.find((x) => x.id === characterId);
  if (!c) throw new Error("unknown character");
  return sample(c.voice.voice_id, await line(`Hi, I'm ${c.name}! ${c.personality}.`, lang), lang);
}

export async function preview(v: Voice, lang: string) {
  if (v.preview_url) return v.preview_url;
  return sample(v.voice_id, await line(PREVIEW_LINE, lang), lang);
}

/** Without a service to ask, every voice is assumed to speak every language. */
export type VoiceCheck = { voice: Voice | null; speaks: boolean; native: Voice | null };
export const checkVoice = async (): Promise<VoiceCheck> => ({ voice: null, speaks: true, native: null });
