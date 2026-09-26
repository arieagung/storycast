# Tech Stack & Development Workflow

## Tech Stack Overview

The project is structured as a two-part monorepo: a frontend client (`web/`) and an optional serverless sharing API (`share/`).

### Frontend (`web/`)
- **Framework**: React 19 (`react`, `react-dom`) with TypeScript (`~6.0.2`).
- **Bundler & Dev Server**: Vite 8 (`@vitejs/plugin-react`).
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`, `tailwindcss`, `clsx`, `tailwind-merge`).
- **Motion & UI Primitives**: Motion (`motion`), Lucide React (`lucide-react`), Next Themes (`next-themes`), Geist Variable Fonts.
- **No AI client library**: The browser makes no API calls to any AI service. All model endpoints are displayed as instructions for the user to execute manually.
- **Linter**: Oxlint (`oxlint` with `.oxlintrc.json`).
- **Routing**: Minimal hash/path routing utility (`src/lib/router.tsx`).
- **State & Storage**: Client state (React hooks), localStorage & IndexedDB (version 2, object stores: `films`, `blobs`, `keyval`) for project records, held files, and the project folder handle (`src/lib/studio/store.ts`).
- **File Access**: File System Access API (`src/lib/studio/assets.ts`) for folder binding. Fallback: drag-drop with IndexedDB blob storage.
- **Import Alias**: `@/*` maps to `./src/*` (configured in `vite.config.ts` and `tsconfig.json`).

### Backend (`share/` — Optional)
- **Runtime**: Cloudflare Workers (TypeScript).
- **Database**: Cloudflare D1 (SQLite) with schema in `schema.sql`.
- **Media Storage**: Cloudflare R2 bucket (`storycast-media`).
- **Security & Bot Protection**: Cloudflare Turnstile, IP hashing with salt, rate limits.
- **Tooling**: Wrangler CLI (`wrangler` v4).

### fal.ai Endpoints (for reference only — never called from the browser)

These are the endpoints the pipeline was written for. They are displayed to the user so they know which of their own models to reach for.

| Constant | Endpoint | Purpose |
|---|---|---|
| `DIRECTOR_APP` | `openrouter/router` | Script, script editor, resize, rephrase, translate (model: `anthropic/claude-opus-5.5`) |
| `VISION` / `VISION_APP` | `openrouter/router/vision` | Describe style, describe character, QC shot check (+ `google/gemini-3.8-flash` for QC) |
| `T2I` | `openai/gpt-image-2.5/flare/text-to-image` | Sheet/hero/keyframe without reference images |
| `EDIT` | `openai/gpt-image-2.5/flare/edit` | Sheet/hero/keyframe with references, end card |
| `R2V` | `minimax/h3-max/reference-to-video` | Voice-over shots and tail shot (Standard Mode) |
| `LIPSYNC` | `minimax/h3-max/lip-sync/image-to-video` | On-camera (T) shots (Standard Mode) |
| `VEO` | `google/veo-3` | All shots in Veo Mode (audio embedded in video) |
| `TTS` | `fal-ai/elevenlabs/tts/eleven-v3` | Narration per block (Standard Mode only) |
| `MUSIC` | `elevenlabs/music/v2.5` | Instrumental score |
| `SEPARATE` | `fal-ai/sam-audio/separate` | Strip speech from shot audio (manual toggle replaces this) |
| `FRAME_AT` | `fal-ai/ffmpeg-api/extract-frame` | QC: extract 3 frames (Redo button replaces this) |
| `TRIM` | `fal-ai/workflow-utilities/trim-video` | Cut each shot to its timeline slot (local ffmpeg replaces this) |
| `MERGE` | `fal-ai/ffmpeg-api/merge-videos` | Join cuts into picture track (local ffmpeg replaces this) |
| `STILL` | `fal-ai/ffmpeg-api/images-to-video` | Render end card still to 4 s clip (local ffmpeg replaces this) |
| `COMPOSE` | `fal-ai/ffmpeg-api/compose` | Multi-track audio mix (local ffmpeg replaces this) |
| `LOUDNORM` | `fal-ai/ffmpeg-api/loudnorm` | Loudness normalisation ×2 (local ffmpeg replaces this) |
| `MERGE_AV` | `fal-ai/ffmpeg-api/merge-audio-video` | Mux audio into video ×2 (local ffmpeg replaces this) |
| `SUBTITLE` | `fal-ai/workflow-utilities/auto-subtitle` | ASR + subtitle burn-in (client-side ASS generation replaces this) |
| — | `fal-ai/ffmpeg-api/metadata` | Probe file duration (`HTMLMediaElement.duration` replaces this) |

## Common Commands

Run commands from the respective subdirectory (`web` or `share`).

### Frontend (`web/`)
- **Install dependencies**: `npm install`
- **Start dev server**: `npm run dev` (starts on port 5173)
- **Production build**: `npm run build` (runs `tsc -b && vite build`)
- **Linting**: `npm run lint` (runs `oxlint`)
- **Preview build**: `npm run preview`

### Backend (`share/`)
- **Install dependencies**: `npm install`
- **Start local worker**: `npm run dev` (runs `wrangler dev`)
- **Type check**: `npm run check` (runs `tsc`)
- **Deploy worker**: `npm run deploy` (runs `wrangler deploy`)
- **Initialize D1 database**: `npm run db:init`

## Environment Configuration

### `web/.env`
- `VITE_SHARE_API`: Base URL of the deployed Cloudflare Worker sharing API (leave empty if running standalone).
- `VITE_TURNSTILE_SITE_KEY`: Turnstile public site key for share verification.
- `VITE_REPO_URL`: Optional GitHub repo link.

### `share` Secrets & Vars
- Configured via `wrangler.jsonc` and `wrangler secret put`:
  - `ALLOWED_ORIGINS`: Allowed CORS origins for the frontend.
  - Secrets: `IP_SALT`, `TURNSTILE_SECRET`, `FAL_KEY` (used only by the share worker for moderation; not used by the frontend).

## Code Conventions & Rules

- **No secrets in client bundles**: No API keys or credentials of any kind are stored in or passed through the frontend. The user supplies nothing but a topic.
- **No AI calls from the browser**: `studio/` modules build and display prompts; they never call any AI endpoint.
- **Asset references**: Media produced by the user is referenced as `local:<project>/<path>` strings. Resolve to a display URL with `useMediaUrl(ref)` or `mediaUrl(ref)` from `assets.ts`; never pass a `local:` string directly to `<img src>` or `<video src>`. Use the `Art` component from `lightbox.tsx` for images. When building a ref from a `ManualTask`'s `AssetInfo`, always include the project root: `` `local:${projectRoot}/${asset.path}` `` — `asset.path` is relative to the project folder, not the root.
- **Prompts are joined**: `ManualTask.prompt` and `TaskHelper.prompt` each contain a single string. For steps that need a system prompt, join them with `joined(system, user)` (exported from `manual.ts`), which produces `SYSTEM\n\n---\n\nUSER`. There is no separate `system` field on either type.
- **Duration is always measured**: Never hardcode or guess file durations. Use `measure(path, file, kind)` from `assets.ts`. Duration drives the entire timeline. In Veo Mode, V-block slot durations come from `spec.clip.duration` (the generated video); in Standard Mode they come from `b.audio.duration` (the narration recording). `blockDuration()` in `pipeline.ts` accepts a `veo` flag to select the correct source.
- **Character Naming & Swapping**: `character_name` can be set at creation for any character choice (preset, custom, or invented). When present, `rec.character_name` overrides `cast.name` in `Studio.given` and `Studio.narrator`. In an ongoing project, `Studio.changeCharacter(newId, newName)` allows swapping narrator characters mid-project, resetting visual outputs (sheet, hero, keyframes, shots, card, film) while preserving script and audio.
- **Storytelling style is separate from the character**: The character only supplies look, name and voice. Tone and structure come from `rec.narrative` (`NarrativeId`, default `"auto"`; missing on old projects = `"auto"`) and `rec.narrative_text` (only for `"custom"`). Presets live in `NARRATIVES` in `director.ts`; `directorSystem(..., narrative)` turns the choice into a "Storytelling style" rule plus a short "Subject" rule (no stand-in props or the narrator's workshop). The cast `personality` reaches the script prompt only when `narrative.id === "personality"` (then the Subject rule is dropped).
- **Rich, varied scenes**: `directorSystem` always adds a "Visual storytelling" rule: each V scene is the most explanatory image for its line (cutaways, cross-sections, macro, aerial, the past, processes mid-action), framing varies block to block. `character_in_shot` is decided freely per V block (no cap; T blocks and the tail always have the narrator). Keyframes without the narrator get only the style reference (`Image 1`), no previous keyframe or model sheet; with no style reference they fall back to T2I with no refs. Keyframes with the narrator keep the previous keyframe as a colour-grade reference, and keep its set only when the scene stays in the same place. `Studio.narrative` reads it; `agent.ts` passes it through the create context. It cannot be changed mid-project.
- **Veo Mode is the default**: `create-form.tsx` initialises `veo` state as `true`. The mode is stored as `rec.veo = true` on the `FilmRecord`. `Studio.veoMode` returns `this.rec.veo === true`. In Veo Mode: `voiceTasks()` returns `[]`; all shots use `veoShotPrompt()` from `pipeline.ts` (motion only: the keyframe is the first frame, so scene/traits are never re-described; narrator introduced once as `NAME, plan.character.tag` then by name; spoken lines after a colon in double quotes, `Voice: <plan.voice_desc>`, `No background music.`); the "voice" stage is omitted from the stage list; "shots" unlocks after keyframes only; "music" unlocks after the script. The render script in Veo Mode pulls audio from individual cut files instead of separate narration tracks.
- **Strict Linting**: oxlint enforces React Hook rules (`react/rules-of-hooks`) and component export patterns (`react/only-export-components`).
- **Modern React**: Use functional components, custom hooks (`use*`), and avoid class components.
- **Path Resolution**: Always use `@/` alias for intra-frontend imports rather than deep relative paths (`../../`).
