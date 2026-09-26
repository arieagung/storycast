import { shape, words } from "./director";
import { END_CARD, GAP, LEAD, TAIL_DUR } from "./pipeline";

const WORDS_PER_SECOND = 2.25;

export type Work = {
  blocks: number;
  talk: number;
  /** Answers you paste back as JSON: the script, the optional edit, reading your images. */
  asks: number;
  images: number;
  recordings: number;
  clips: number;
  music: number;
  total: number;
  seconds: number;
};

/** How much there is to make by hand, so the length slider is an honest promise. */
export function estimateWork(minutes: number, opts: { invent?: boolean; customStyle?: boolean; uploadedCharacter?: boolean; veo?: boolean } = {}): Work {
  const [n, t] = shape(minutes);
  const v = n - t;
  const [vSpeech, tSpeech] = words(minutes).map((r) => {
    const [a, b] = r.split("-").map(Number);
    return (a + b) / 2 / WORDS_PER_SECOND;
  });
  const asks = 1 + 1 + (opts.customStyle ? 1 : 0) + (opts.uploadedCharacter ? 1 : 0);
  const images = n + 1 + (opts.invent ? 2 : 0) + 1;
  const clips = n + 1;
  const recordings = opts.veo ? 0 : n;
  const seconds = LEAD + v * (vSpeech + GAP) + t * (tSpeech + GAP) + TAIL_DUR + END_CARD;
  return { blocks: n, talk: t, asks, images, recordings, clips, music: 1, total: asks + images + recordings + clips + 1, seconds };
}

export const workLine = (w: Work) =>
  w.recordings > 0
    ? `${w.asks} answers · ${w.images} images · ${w.recordings} recordings · ${w.clips} shots · 1 score`
    : `${w.asks} answers · ${w.images} images · ${w.clips} shots · 1 score (Veo Mode)`;
