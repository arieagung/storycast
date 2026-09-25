import type { Plan } from "./director";
import { COMPOSE, END_CARD, FINAL_LUFS, FPS, FRAME, LOUDNORM, MERGE, MERGE_AV, MUSIC_LUFS, STILL, SUBTITLE, TRIM, blockDuration, timeline, type Spec } from "./pipeline";
import { subtitleLines, toAss, toSrt } from "./subtitles";

/* ------------------------------------------------------------------ *\
   The edit

   The original ran this on fal: trim-video per shot, merge-videos,
   images-to-video for the end card, compose for the multi-track mix,
   loudnorm twice and merge-audio-video, then auto-subtitle. None of it
   is a model; it is all ffmpeg. So the app works out the cut and writes
   a script you run once in the project folder.

   Two deliberate differences from the original:
   - Short shots are held on their last frame to fill their slot, so the
     picture cannot drift away from the narration. fal's merge simply
     made the film shorter.
   - Narration is placed for talking blocks too, from the same file the
     lip-sync was made from, instead of re-using the audio baked into
     that shot. Identical timing, one less generation of encoding.
\* ------------------------------------------------------------------ */

export type RenderSource = {
  plan: Plan;
  specs: Spec[];
  /** Paths inside the project folder. */
  shots: Record<string, string>;
  narration: Record<string, string>;
  music: string;
  card: string;
  font: string;
  accent: string;
  lang: string;
};

export type RenderFile = { path: string; text: string; note: string };
export type RenderKit = {
  files: RenderFile[];
  steps: { label: string; note: string; command: string }[];
  outputs: { clean: string; film: string };
  total: number;
  ambience: string[];
  font: string;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const msOf = (n: number) => Math.round(n * 1000);
const nn = (i: number) => String(i + 1).padStart(2, "0");

const SCALE = `scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=increase,crop=${FRAME.width}:${FRAME.height}`;
const V_CODEC = `-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -video_track_timescale ${FPS * 1000}`;

export function renderKit(src: RenderSource): RenderKit {
  const { plan, specs } = src;
  const { starts, segments, total } = timeline(plan, specs);
  const steps: RenderKit["steps"] = [];
  const cuts: string[] = [];
  const ambience: string[] = [];

  // 1. Every shot cut to the slot the timeline gives it.
  segments.forEach((seg, i) => {
    const spec = specs.find((s) => s.shot === seg.shot);
    const source = src.shots[seg.shot];
    const out = `build/cut-${nn(i)}-${seg.shot}.mp4`;
    cuts.push(out);
    const pad = r3(seg.dur - (spec?.clip?.duration ?? seg.dur));
    const vf = [SCALE, pad > 0.02 ? `tpad=stop_mode=clone:stop_duration=${pad + 0.2}` : "", `fps=${FPS}`, "format=yuv420p"].filter(Boolean).join(",");
    steps.push({
      label: `Cut ${seg.shot}`,
      note: `${r3(seg.dur)} s slot${pad > 0.02 ? `, held ${pad} s on its last frame` : ""} · replaces ${TRIM}`,
      command: `ffmpeg -y -hide_banner -i "${source}" -an -vf "${vf}" -t ${r3(seg.dur)} -r ${FPS} ${V_CODEC} "${out}"`,
    });
    if (spec?.keep_sound && source) ambience.push(seg.shot);
  });

  // 2. The end card, four seconds of one still.
  const card = `build/cut-${nn(segments.length)}-endcard.mp4`;
  cuts.push(card);
  steps.push({
    label: "End card",
    note: `${END_CARD} s still · replaces ${STILL}`,
    command: `ffmpeg -y -hide_banner -loop 1 -i "${src.card}" -t ${END_CARD} -vf "${SCALE},fps=${FPS},format=yuv420p" ${V_CODEC} "${card}"`,
  });

  // 3. One picture track.
  steps.push({
    label: "Picture",
    note: `${cuts.length} cuts joined · replaces ${MERGE}`,
    command: `ffmpeg -y -hide_banner -f concat -safe 0 -i "build/picture.txt" -c copy "build/picture.mp4"`,
  });

  /* 4. The mix: narration where the timeline puts it, ambience from any
        shot you kept, and the score under all of it. */
  const inputs: string[] = [`-i "build/picture.mp4"`];
  const filter: string[] = [];
  const legs: string[] = [];
  let index = 1;

  for (const b of plan.blocks) {
    const path = src.narration[b.id];
    if (!path) continue;
    inputs.push(`-i "${path}"`);
    const leg = `vo${b.id}`;
    filter.push(`[${index}:a]aresample=48000,adelay=${msOf(starts[b.id] ?? 0)}:all=1[${leg}]`);
    legs.push(`[${leg}]`);
    index++;
  }
  for (const shot of ambience) {
    const seg = segments.find((s) => s.shot === shot)!;
    inputs.push(`-i "${src.shots[shot]}"`);
    const leg = `amb${shot}`;
    filter.push(`[${index}:a]aresample=48000,atrim=0:${r3(seg.dur)},asetpts=N/SR/TB,volume=0.5,adelay=${msOf(seg.start)}:all=1[${leg}]`);
    legs.push(`[${leg}]`);
    index++;
  }
  if (src.music) {
    inputs.push(`-i "${src.music}"`);
    filter.push(`[${index}:a]aresample=48000,loudnorm=I=${MUSIC_LUFS}:TP=-2:print_format=none[score]`);
    legs.push("[score]");
    index++;
  }
  filter.push(`${legs.join("")}amix=inputs=${legs.length}:duration=longest:normalize=0[sum]`);
  filter.push(`[sum]loudnorm=I=${FINAL_LUFS}:TP=-1.5:print_format=none,apad,atrim=0:${r3(total)},asetpts=N/SR/TB[mix]`);

  steps.push({
    label: "Mix",
    note: `${legs.length} tracks, loudness ${MUSIC_LUFS} LUFS score under a ${FINAL_LUFS} LUFS mix · replaces ${COMPOSE} + ${LOUDNORM} + ${MERGE_AV}`,
    command:
      `ffmpeg -y -hide_banner ${inputs.join(" ")} -filter_complex_script "build/mix.txt" ` +
      `-map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -t ${r3(total)} "clean.mp4"`,
  });

  // 5. Word-by-word subtitles, burned in.
  steps.push({
    label: "Subtitles",
    note: `word-by-word burn-in · replaces ${SUBTITLE}`,
    command: `ffmpeg -y -hide_banner -i "clean.mp4" -vf "ass=subtitles.ass" ${V_CODEC} -c:a copy -movflags +faststart "film.mp4"`,
  });

  /* Subtitles follow the narration file, not the shot: a lip-sync shot can come
     back a little longer than the line it was made from, and the words belong to
     the line. */
  const spoken = Object.fromEntries(plan.blocks.map((b) => [b.id, b.audio?.duration ?? blockDuration(b, specs)]));
  const lines = subtitleLines(plan, starts, spoken);

  const files: RenderFile[] = [
    { path: "subtitles.ass", text: toAss(lines, { font: src.font, accent: src.accent }), note: "burned into film.mp4 in the last step" },
    { path: "subtitles.srt", text: toSrt(lines), note: "the same lines as a plain file, for players and editors" },
    { path: "build/picture.txt", text: cuts.map((c) => `file '${c.replace(/^build\//, "")}'`).join("\n") + "\n", note: "the order the cuts are joined in" },
    { path: "build/mix.txt", text: filter.join(";\n") + "\n", note: "the audio graph, kept in a file so no shell has to quote it" },
  ];
  return { files, steps, outputs: { clean: "clean.mp4", film: "film.mp4" }, total, ambience, font: src.font };
}

/* ------------------------------------------------------------------ *\
   The two scripts
\* ------------------------------------------------------------------ */

export function powershell(kit: RenderKit, title: string): string {
  const lines = [
    "# Storycast · the edit",
    `# ${title}`,
    "#",
    "# Run this inside the film's folder:  powershell -ExecutionPolicy Bypass -File .\\render.ps1",
    "# Needs ffmpeg on PATH, built with libass for the subtitle step.",
    `# The subtitles ask for the font "${kit.font}". If it is not installed, ffmpeg quietly picks another one.`,
    "",
    '$ErrorActionPreference = "Stop"',
    "Set-Location -LiteralPath $PSScriptRoot",
    "New-Item -ItemType Directory -Force -Path build | Out-Null",
    "",
    "function Check($step) { if ($LASTEXITCODE -ne 0) { throw \"$step failed (ffmpeg exit $LASTEXITCODE)\" } }",
    "",
  ];
  kit.steps.forEach((s, i) => {
    lines.push(`Write-Host "[${i + 1}/${kit.steps.length}] ${s.label} — ${s.note}" -ForegroundColor Cyan`, s.command, `Check "${s.label}"`, "");
  });
  lines.push(
    `Write-Host "Done. film.mp4 (${Math.round(kit.total)} s, with subtitles) and clean.mp4 (without) are in this folder." -ForegroundColor Green`,
    "",
  );
  return lines.join("\n");
}

export function bash(kit: RenderKit, title: string): string {
  const lines = [
    "#!/usr/bin/env bash",
    "# Storycast · the edit",
    `# ${title}`,
    "#",
    "# Run this inside the film's folder:  bash render.sh",
    "# Needs ffmpeg on PATH, built with libass for the subtitle step.",
    `# The subtitles ask for the font "${kit.font}". If it is not installed, ffmpeg quietly picks another one.`,
    "",
    "set -euo pipefail",
    'cd "$(dirname "$0")"',
    "mkdir -p build",
    "",
  ];
  kit.steps.forEach((s, i) => {
    lines.push(`echo "[${i + 1}/${kit.steps.length}] ${s.label} — ${s.note}"`, s.command, "");
  });
  lines.push(`echo "Done. film.mp4 (${Math.round(kit.total)} s, with subtitles) and clean.mp4 (without) are in this folder."`, "");
  return lines.join("\n");
}
