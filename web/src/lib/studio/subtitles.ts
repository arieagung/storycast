import type { Plan } from "./director";
import { FRAME, namedRgb, type FrameSize } from "./pipeline";

/* ------------------------------------------------------------------ *\
   Subtitles

   The original sent the finished film through fal's auto-subtitle, which
   transcribed it. Here the exact words and the exact narration lengths
   are already known, so the timing is worked out directly: every block
   starts where the mix puts its narration, and its words share that
   block's length in proportion to how long they take to say.
\* ------------------------------------------------------------------ */

export type SubWord = { text: string; start: number; end: number };
export type SubLine = { start: number; end: number; words: SubWord[] };

const weigh = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1;

/** Splits one narration line over its own stretch of the film. */
export function lineWords(text: string, start: number, duration: number): SubWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || duration <= 0) return [];
  const weights = words.map(weigh);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = start;
  return words.map((w, i) => {
    const d = (duration * weights[i]) / total;
    const word = { text: w, start: t, end: t + d };
    t += d;
    return word;
  });
}

export function subtitleLines(plan: Plan, starts: Record<string, number>, lengths: Record<string, number>, perLine = 4): SubLine[] {
  const lines: SubLine[] = [];
  for (const b of plan.blocks) {
    const words = lineWords(b.text, starts[b.id] ?? 0, lengths[b.id] ?? 0);
    for (let i = 0; i < words.length; i += perLine) {
      const group = words.slice(i, i + perLine);
      lines.push({ start: group[0].start, end: group[group.length - 1].end, words: group });
    }
  }
  return lines.sort((a, b) => a.start - b.start);
}

/* ------------------------------------------------------------------ *\
   Advanced SubStation, so the burn-in can highlight the spoken word
\* ------------------------------------------------------------------ */

const bgr = ([r, g, b]: [number, number, number]) => [b, g, r].map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
const clock = (t: number) => {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};
const escape = (s: string) => s.replaceAll("{", "(").replaceAll("}", ")").replaceAll("\\", "/").replaceAll("\n", "\\N");

export type SubStyle = { font: string; accent: string; fontSize?: number; stroke?: number; marginV?: number };

export function toAss(lines: SubLine[], style: SubStyle, frame: FrameSize = FRAME): string {
  const accent = bgr(namedRgb(style.accent));
  const scale = frame.height / 768;
  const size = style.fontSize ?? Math.round(54 * scale);
  const stroke = style.stroke ?? Math.max(2, Math.round(3 * scale));
  const marginV = style.marginV ?? Math.round(40 * scale);
  const marginH = Math.max(20, Math.round(80 * (frame.width / 1344)));
  const head = [
    "[Script Info]",
    "; Written by Storycast from the script and the narration lengths",
    "ScriptType: v4.00+",
    `PlayResX: ${frame.width}`,
    `PlayResY: ${frame.height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Storycast,${style.font},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${stroke},0,2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text",
  ];
  const events: string[] = [];
  for (const line of lines) {
    // One event per word so the spoken word can carry the accent colour while the rest of the line stays white.
    line.words.forEach((word, i) => {
      const body = line.words
        .map((w, j) => (j === i ? `{\\c&H${accent}&}${escape(w.text)}{\\c&HFFFFFF&}` : escape(w.text)))
        .join(" ");
      events.push(`Dialogue: 0,${clock(word.start)},${clock(word.end)},Storycast,,0,0,0,,${body}`);
    });
  }
  return [...head, ...events, ""].join("\n");
}

const srtClock = (t: number) => {
  const s = Math.max(0, t);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = (s % 60).toFixed(3).padStart(6, "0").replace(".", ",");
  return `${h}:${m}:${sec}`;
};

/** A plain companion file, for players and editors that want one. */
export function toSrt(lines: SubLine[]): string {
  return (
    lines
      .map((l, i) => `${i + 1}\n${srtClock(l.start)} --> ${srtClock(l.end)}\n${l.words.map((w) => w.text).join(" ")}\n`)
      .join("\n") + "\n"
  );
}
