import { SLOTS, narrationSlot, shotSlot, slotPath } from "./assets";
import type { Plan } from "./director";
import { CARD_FADE, COMPOSE, END_CARD, FINAL_LUFS, FPS, FRAME, LOUDNORM, MERGE, MERGE_AV, MUSIC_LUFS, STILL, SUBTITLE, TAIL_ID, TRIM, blockDuration, tailSpoken, detectFrameFromAssets, timeline, type FrameSize, type Spec } from "./pipeline";
import { subtitleLines, toAss, toSrt } from "./subtitles";

/* ------------------------------------------------------------------ *\
   The edit

   Two modes:

   STANDARD MODE
   The original fal pipeline: trim-video per shot, merge-videos,
   images-to-video for the end card, compose for the multi-track mix,
   loudnorm twice and merge-audio-video, then auto-subtitle.
   Narration audio (TTS) is separate; it drives the timeline slot lengths.
   Clips are trimmed/padded to fit their slot so the picture never drifts
   from the narration.

   VEO MODE
   Narration is already embedded in each Veo clip — the clip IS the slot.
   No timeline slots with LEAD/GAP are needed; clips are stitched directly
   in the order they were generated:
     1. Re-encode every clip to a common resolution/fps (no -t trim, no -an).
     2. Add the end card still.
     3. Concat all clips into a single picture+audio track (picture.mp4).
     4. Layer the score under the embedded audio and loudness-normalise.
     5. Burn-in subtitles → film.mp4.

   SUBTITLE WORKFLOW
   After the stitch+mix steps produce clean.mp4, subtitles are generated in
   a separate stage. The user either accepts the auto-generated ASS/SRT or
   pastes a replacement SRT from an LLM vision tool. The render script then
   burns whichever SRT is present into film.mp4.
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
  /** When true, narration audio is embedded in each shot clip; skip separate narration tracks. */
  veo?: boolean;
  /** Video frame resolution / aspect ratio. Defaults to detected uploaded clips/keyframes or standard 16:9. */
  frame?: FrameSize;
  /**
   * Path to a user-supplied SRT file (from the subtitle stage).
   * When present the render kit converts it to ASS and uses it for burn-in.
   * When absent the auto-generated ASS (derived from the script and narration lengths) is used.
   */
  srtPath?: string;
};

export type RenderFile = { path: string; text: string; note: string };
export type RenderKit = {
  /** Files needed to run the edit (render scripts, concat list, audio filter graph). Written by build(). */
  files: RenderFile[];
  /** Files needed for the burn step (subtitles.ass fallback, subtitles.srt). Written by build() after SRT is pasted. */
  burnFiles: RenderFile[];
  steps: { label: string; note: string; command: string }[];
  /** The burn-in step, kept separate so the subtitle stage can show it on its own. */
  burnStep: { label: string; note: string; command: string };
  outputs: { clean: string; film: string };
  total: number;
  ambience: string[];
  font: string;
  frame: FrameSize;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const msOf = (n: number) => Math.round(n * 1000);
const nn = (i: number) => String(i + 1).padStart(2, "0");

const V_CODEC = `-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -video_track_timescale ${FPS * 1000}`;

export function renderKit(src: RenderSource): RenderKit {
  const { plan, specs } = src;
  const frame = src.frame ?? detectFrameFromAssets(specs.map((s) => s.clip).concat(specs.map((s) => s.key)), FRAME);
  const scale = `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase,crop=${frame.width}:${frame.height}`;
  const { starts, segments, pictureEnd, total } = timeline(plan, specs, src.veo);
  const steps: RenderKit["steps"] = [];
  const cuts: string[] = [];
  const ambience: string[] = [];
  const filter: string[] = [];

  const cardVf = [
    scale,
    `fps=${FPS}`,
    `fade=t=in:st=0:d=${CARD_FADE}`,
    `fade=t=out:st=${r3(END_CARD - CARD_FADE)}:d=${CARD_FADE}`,
    "format=yuv420p",
  ].join(",");

  if (src.veo) {
    // VEO MODE — clips already contain embedded narration; stitch them directly.
    // Step 1: Re-encode each clip to a common resolution/fps, preserving audio.
    segments.forEach((seg, i) => {
      const isTail = i === segments.length - 1;
      const spec = specs.find((s) => s.shot === seg.shot);
      const source = src.shots[seg.shot] || slotPath(shotSlot(seg.shot));
      const out = `build/cut-${nn(i)}-${seg.shot}.mp4`;
      cuts.push(out);
      const clipDur = spec?.clip?.duration ?? seg.dur;
      // No -t trim, no -an, no tpad — the clip is already the right length.
      const vfParts = [scale, `fps=${FPS}`];
      if (isTail) {
        const fadeDur = r3(Math.min(CARD_FADE, clipDur));
        const fadeSt = r3(Math.max(0, clipDur - fadeDur));
        vfParts.push(`fade=t=out:st=${fadeSt}:d=${fadeDur}`);
      }
      vfParts.push("format=yuv420p");
      const vf = vfParts.join(",");

      const afArg = isTail
        ? `-af "afade=t=out:st=${r3(Math.max(0, clipDur - Math.min(CARD_FADE, clipDur)))}:d=${r3(Math.min(CARD_FADE, clipDur))}" `
        : "";

      steps.push({
        label: `Normalize ${seg.shot}`,
        note: `${r3(clipDur)} s · re-encode to ${frame.width}×${frame.height} ${FPS} fps, keep audio${isTail ? ", fade to black" : ""}`,
        command: `ffmpeg -y -hide_banner -i "${source}" -vf "${vf}" ${V_CODEC} ${afArg}-c:a aac -b:a 192k -ar 48000 "${out}"`,
      });
    });

    // Step 2: End card with fade transitions and silent audio stream to maintain stream parity in concat.
    const card = `build/cut-${nn(segments.length)}-endcard.mp4`;
    cuts.push(card);
    const cardSource = src.card || slotPath(SLOTS.card);
    steps.push({
      label: "End card",
      note: `${END_CARD} s still · fade in & out transitions · replaces ${STILL}`,
      command: `ffmpeg -y -hide_banner -loop 1 -i "${cardSource}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -t ${END_CARD} -vf "${cardVf}" ${V_CODEC} -c:a aac -b:a 192k -shortest "${card}"`,
    });

    // Step 3: Concat all clips with audio into one track.
    steps.push({
      label: "Stitch",
      note: `${cuts.length} clips joined · replaces ${MERGE}`,
      command: `ffmpeg -y -hide_banner -f concat -safe 0 -i "build/picture.txt" -c copy "build/picture.mp4"`,
    });

    // Step 4: Mix — layer score under the embedded audio from the stitched track.
    if (src.music) {
      const musicInputs = `-i "build/picture.mp4" -i "${src.music}"`;
      const fadeSt = r3(pictureEnd);
      const musicFilter = [
        `[1:a]aresample=48000,loudnorm=I=${MUSIC_LUFS}:TP=-2:print_format=none,afade=t=out:st=${fadeSt}:d=${END_CARD}[score]`,
        `[0:a][score]amix=inputs=2:duration=first:normalize=0[sum]`,
        `[sum]loudnorm=I=${FINAL_LUFS}:TP=-1.5:print_format=none,afade=t=out:st=${fadeSt}:d=${END_CARD}[mix]`,
      ];
      steps.push({
        label: "Score",
        note: `mix score under embedded narration, fade out score during end card, loudness ${FINAL_LUFS} LUFS · replaces ${COMPOSE} + ${LOUDNORM} + ${MERGE_AV}`,
        command:
          `ffmpeg -y -hide_banner ${musicInputs} -filter_complex "${musicFilter.join("; ")}" ` +
          `-map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -t ${r3(total)} "clean.mp4"`,
      });
    } else {
      // No music — just copy picture.mp4 as the clean output.
      steps.push({
        label: "Clean",
        note: "no score — copy stitched track as clean.mp4",
        command: `ffmpeg -y -hide_banner -i "build/picture.mp4" -c copy "clean.mp4"`,
      });
    }
  } else {
    // STANDARD MODE — narration is separate; clips must be trimmed to their timeline slots.
    // Step 1: Every shot cut to the slot the timeline gives it.
    segments.forEach((seg, i) => {
      const isTail = i === segments.length - 1;
      const spec = specs.find((s) => s.shot === seg.shot);
      const source = src.shots[seg.shot] || slotPath(shotSlot(seg.shot));
      const out = `build/cut-${nn(i)}-${seg.shot}.mp4`;
      cuts.push(out);
      const pad = r3(seg.dur - (spec?.clip?.duration ?? seg.dur));
      const vfParts = [scale];
      if (pad > 0.02) {
        vfParts.push(`tpad=stop_mode=clone:stop_duration=${r3(pad + 0.2)}`);
      }
      vfParts.push(`fps=${FPS}`);
      if (isTail) {
        const fadeDur = r3(Math.min(CARD_FADE, seg.dur));
        const fadeSt = r3(Math.max(0, seg.dur - fadeDur));
        vfParts.push(`fade=t=out:st=${fadeSt}:d=${fadeDur}`);
      }
      vfParts.push("format=yuv420p");
      const vf = vfParts.join(",");

      steps.push({
        label: `Cut ${seg.shot}`,
        note: `${r3(seg.dur)} s slot${pad > 0.02 ? `, held ${r3(pad)} s on its last frame` : ""}${isTail ? ", fade to black" : ""} · replaces ${TRIM}`,
        command: `ffmpeg -y -hide_banner -i "${source}" -an -vf "${vf}" -t ${r3(seg.dur)} -r ${FPS} ${V_CODEC} "${out}"`,
      });
    });

    // Step 2: End card with fade transitions.
    const card = `build/cut-${nn(segments.length)}-endcard.mp4`;
    cuts.push(card);
    const cardSource = src.card || slotPath(SLOTS.card);
    steps.push({
      label: "End card",
      note: `${END_CARD} s still · fade in & out transitions · replaces ${STILL}`,
      command: `ffmpeg -y -hide_banner -loop 1 -i "${cardSource}" -t ${END_CARD} -vf "${cardVf}" ${V_CODEC} -an "${card}"`,
    });

    // Step 3: One picture track.
    steps.push({
      label: "Picture",
      note: `${cuts.length} cuts joined · replaces ${MERGE}`,
      command: `ffmpeg -y -hide_banner -f concat -safe 0 -i "build/picture.txt" -c copy "build/picture.mp4"`,
    });

    // Step 4: Mix — narration + ambience + score.
    const inputs: string[] = [`-i "build/picture.mp4"`];
    const legs: string[] = [];
    let index = 1;

    for (const b of plan.blocks) {
      const path = src.narration[b.id] || slotPath(narrationSlot(b.id));
      inputs.push(`-i "${path}"`);
      const leg = `vo${b.id}`;
      filter.push(`[${index}:a]aresample=48000,adelay=${msOf(starts[b.id] ?? 0)}:all=1[${leg}]`);
      legs.push(`[${leg}]`);
      index++;
    }
    // The tail's closing line, laid in just after the cut to the closing shot.
    if (plan.tail.text?.trim() && plan.tail.audio) {
      const path = src.narration[TAIL_ID] || slotPath(narrationSlot(TAIL_ID));
      inputs.push(`-i "${path}"`);
      filter.push(`[${index}:a]aresample=48000,adelay=${msOf(starts[TAIL_ID] ?? 0)}:all=1[vo${TAIL_ID}]`);
      legs.push(`[vo${TAIL_ID}]`);
      index++;
    }
    for (const shot of ambience) {
      const seg = segments.find((s) => s.shot === shot)!;
      const source = src.shots[shot] || slotPath(shotSlot(shot));
      inputs.push(`-i "${source}"`);
      const leg = `amb${shot}`;
      filter.push(`[${index}:a]aresample=48000,atrim=0:${r3(seg.dur)},asetpts=N/SR/TB,volume=0.5,adelay=${msOf(seg.start)}:all=1[${leg}]`);
      legs.push(`[${leg}]`);
      index++;
    }
    if (src.music) {
      const fadeSt = r3(pictureEnd);
      inputs.push(`-i "${src.music}"`);
      filter.push(`[${index}:a]aresample=48000,loudnorm=I=${MUSIC_LUFS}:TP=-2:print_format=none,afade=t=out:st=${fadeSt}:d=${END_CARD}[score]`);
      legs.push("[score]");
      index++;
    }
    filter.push(`${legs.join("")}amix=inputs=${legs.length}:duration=longest:normalize=0[sum]`);
    filter.push(`[sum]loudnorm=I=${FINAL_LUFS}:TP=-1.5:print_format=none,afade=t=out:st=${r3(pictureEnd)}:d=${END_CARD},apad,atrim=0:${r3(total)},asetpts=N/SR/TB[mix]`);

    steps.push({
      label: "Mix",
      note: `${legs.length} tracks, loudness ${MUSIC_LUFS} LUFS score (fading out during end card) under a ${FINAL_LUFS} LUFS mix · replaces ${COMPOSE} + ${LOUDNORM} + ${MERGE_AV}`,
      command:
        `ffmpeg -y -hide_banner ${inputs.join(" ")} -filter_complex_script "build/mix.txt" ` +
        `-map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -t ${r3(total)} "clean.mp4"`,
    });
  }

  /* Subtitle timing:
     Standard mode — use narration audio duration per block (TTS file drives the slot).
     Veo mode — use clip duration per block (narration is embedded in the clip). */
  const spoken = Object.fromEntries(
    plan.blocks.map((b) => [
      b.id,
      src.veo
        ? (specs.find((s) => s.shot === b.shot)?.clip?.duration ?? blockDuration(b, specs, true))
        : (b.audio?.duration ?? blockDuration(b, specs)),
    ]),
  );
  spoken[TAIL_ID] = tailSpoken(plan, specs, src.veo);
  const autoLines = subtitleLines(plan, starts, spoken);

  // In Veo Mode the Standard Mix filter is not used, so build/mix.txt is empty.
  const mixFilter = src.veo ? "" : (filter.join(";\n") + "\n");

  // Burn-in step — kept separate from the cut/mix steps so it maps to the subtitle stage.
  // Always reference subtitle files by name only (relative to the project folder where the
  // command is run). Never embed full OS paths — they break on other machines.
  const burnStep: RenderKit["burnStep"] = src.srtPath
    ? {
        label: "Burn subtitles",
        note: `burn in user-supplied SRT · replaces ${SUBTITLE}`,
        command: `ffmpeg -y -hide_banner -i "clean.mp4" -vf "subtitles=subtitles.srt" ${V_CODEC} -c:a copy -movflags +faststart "film.mp4"`,
      }
    : {
        label: "Burn subtitles",
        note: `word-by-word burn-in from auto-generated ASS · replaces ${SUBTITLE}`,
        command: `ffmpeg -y -hide_banner -i "clean.mp4" -vf "ass=subtitles.ass" ${V_CODEC} -c:a copy -movflags +faststart "film.mp4"`,
      };

  const files: RenderFile[] = [
    { path: "build/picture.txt", text: cuts.map((c) => `file '${c.replace(/^build\//, "")}'`).join("\n") + "\n", note: "the order the clips are joined in" },
    ...(mixFilter ? [{ path: "build/mix.txt", text: mixFilter, note: "the audio graph, kept in a file so no shell has to quote it" }] : []),
  ];

  // Subtitle files are written at burn time, not during the edit.
  // subtitles.ass is the auto-generated fallback; subtitles.srt is the plain companion.
  // If the user has pasted an SRT, it is already on disk and burnStep references it directly.
  const burnFiles: RenderFile[] = [
    { path: "subtitles.ass", text: toAss(autoLines, { font: src.font, accent: src.accent }, frame), note: "auto-generated word-by-word ASS — used as fallback when no SRT was pasted" },
    { path: "subtitles.srt", text: toSrt(autoLines), note: "auto-generated plain SRT — reference for checking timing" },
  ];

  return { files, burnFiles, steps, burnStep, outputs: { clean: "clean.mp4", film: "film.mp4" }, total, ambience, font: src.font, frame };
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
    "# Needs ffmpeg on PATH.",
    "# Produces clean.mp4 (the cut without subtitles). Run the burn command from the Subtitles step next.",
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
    `Write-Host "Done. clean.mp4 (${Math.round(kit.total)} s, without subtitles) is in this folder. Run the burn command from the Subtitles step to produce film.mp4." -ForegroundColor Green`,
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
    "# Needs ffmpeg on PATH.",
    "# Produces clean.mp4 (the cut without subtitles). Run the burn command from the Subtitles step next.",
    "",
    "set -euo pipefail",
    'cd "$(dirname "$0")"',
    "mkdir -p build",
    "",
  ];
  kit.steps.forEach((s, i) => {
    lines.push(`echo "[${i + 1}/${kit.steps.length}] ${s.label} — ${s.note}"`, s.command, "");
  });
  lines.push(`echo "Done. clean.mp4 (${Math.round(kit.total)} s, without subtitles) is in this folder. Run the burn command from the Subtitles step to produce film.mp4."`, "");
  return lines.join("\n");
}
