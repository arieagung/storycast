# Project Structure & Organization

```
storycast/
├── .kiro/
│   └── steering/                  # Steering documentation for AI assistants (product.md, tech.md, structure.md)
├── web/                           # Vite + React 19 single-page application (frontend studio)
│   ├── public/                    # Static assets served as-is
│   │   ├── data/                  # Static datasets (cache.json, config.json, films.json)
│   │   ├── static/
│   │   │   ├── characters/        # Character portrait thumbnails
│   │   │   ├── posters/           # Film poster thumbnails
│   │   │   └── styles/            # Visual style preview thumbnails
│   │   ├── favicon.svg            # Favicon
│   │   └── logo.svg               # Brand logo
│   ├── src/
│   │   ├── App.tsx                # Root component: routing, project tracking, toasts
│   │   ├── main.tsx               # React application entry point
│   │   ├── index.css              # Global styles and Tailwind CSS directives
│   │   ├── components/
│   │   │   ├── app/               # Domain-specific UI components
│   │   │   │   ├── agent-button.tsx     # "Copy agent prompt" button
│   │   │   │   ├── character-picker.tsx # Character selection carousel/grid
│   │   │   │   ├── create-form.tsx      # New film configuration form (topic, style, voice, length)
│   │   │   │   ├── film-card.tsx        # Card for finished films in gallery/library
│   │   │   │   ├── film-player.tsx      # Video player with controls; resolves local: refs via useMediaUrl
│   │   │   │   ├── films-page.tsx       # Local films library and management view
│   │   │   │   ├── folder-bar.tsx       # Project folder binding (File System Access API).
│   │   │   │   │                        # Works in Edge and Chrome; Brave needs "File editing" under Site permissions.
│   │   │   │   │                        # Fallback: drop files onto each task card.
│   │   │   │   ├── gallery.tsx          # Community films explore view
│   │   │   │   ├── header.tsx           # Site navigation header with folder status indicator
│   │   │   │   ├── hero.tsx             # Homepage hero section
│   │   │   │   ├── lightbox.tsx         # Media lightbox; also exports Art (image component that resolves local: refs)
│   │   │   │   │                        # and downloadFile (resolves local: before fetching)
│   │   │   │   ├── project-row.tsx      # Horizontal scrollable list of in-progress and finished projects
│   │   │   │   ├── share-dialog.tsx     # Sharing link and Turnstile verification modal
│   │   │   │   ├── studio-panel.tsx     # Main workbench UI. Three-column layout on desktop:
│   │   │   │   │                        #   col 1 — SectionNav: sticky floating nav with section + per-task sub-items,
│   │   │   │   │                        #            IntersectionObserver highlights the active section/task while scrolling.
│   │   │   │   │                        #            Section ids: stage-<key>. Task wrapper ids: task-<key>.
│   │   │   │   │                        #   col 2 — sidebar: TodoList checklist, script, event log
│   │   │   │   │                        #   col 3 — stage sections: RenderPanel for the edit step, TaskCard per task
│   │   │   │   ├── style-picker.tsx     # Art style selection component
│   │   │   │   ├── task-card.tsx        # Single step card. Key behaviours:
│   │   │   │   │                        #   - prompt field combines system + user (separated by ---); label says "Prompt (system + user)" for JSON tasks
│   │   │   │   │                        #   - promptPlaceholders renders a warning box listing tokens to replace before sending
│   │   │   │   │                        #   - Preview resolves local: refs as `local:<projectRoot>/<asset.path>`
│   │   │   │   │                        #   - onConfirm clears the QC warning on V/tail shots after the user checks the result
│   │   │   │   ├── voice-field.tsx      # Voice selector input
│   │   │   │   ├── voice-library.tsx    # Browse and sample available voices (requires share/ worker)
│   │   │   │   └── watch-page.tsx       # Single film watching view
│   │   │   ├── motion/            # Generic animated UI primitives & micro-interactions
│   │   │   │   ├── action-swap.tsx      # Smooth action swapping button/transition
│   │   │   │   ├── animated-toast-stack.tsx # Stacked toast notifications
│   │   │   │   ├── button/              # Specialized animated buttons
│   │   │   │   ├── combobox/            # Combobox component
│   │   │   │   ├── drawer.tsx           # Drawer/sheet modal
│   │   │   │   ├── input.tsx            # Styled animated input
│   │   │   │   ├── marquee.tsx          # Scrolling marquee
│   │   │   │   ├── number-ticker.tsx    # Numeric animation ticker
│   │   │   │   ├── range-slider.tsx     # Slider control
│   │   │   │   ├── select.tsx           # Select dropdown
│   │   │   │   ├── theme-toggle.tsx     # Dark/light mode switcher
│   │   │   │   └── tilt-card.tsx        # 3D interactive tilt card
│   │   │   └── agents/            # Agent disclosure and status display components
│   │   │       ├── agent-disclosure.tsx
│   │   │       ├── loading-states/
│   │   │       └── todo-list.tsx
│   │   └── lib/                   # Utilities, APIs, and studio core
│   │       ├── agent.ts           # Agent prompt builder (agentBrief); reads AgentContext set by pages
│   │       ├── api.ts             # High-level types (Job, Film, NewJob, Voice, Config) and api object
│   │       ├── router.tsx         # Lightweight client-side hash/path router
│   │       ├── share.ts           # Client API functions for Cloudflare Worker sharing
│   │       ├── utils.ts           # Class merging (cn) and general utilities
│   │       ├── ease.ts            # Easing curve constants for animations
│   │       ├── presence-gate.tsx  # AnimatePresence wrapper utility
│   │       ├── touch.ts           # Touch gesture helpers
│   │       ├── use-player.ts      # Custom hook for audio/video playback state
│   │       └── studio/            # Manual film production engine
│   │           ├── assets.ts      # File System Access API binding, blob storage fallback,
│   │           │                  # duration/dimension probing, local: ref resolution, useMediaUrl/useFolder/useGeneration
│   │           ├── data.ts        # Loader for preset characters, styles, and config (config.json)
│   │           ├── director.ts    # All prompt builders and JSON validators.
│   │           │                  # Prompt builders: directorSystem, continuityPrompt, keyframePrompt, shotPrompt,
│   │           │                  # endCardPrompt, characterPrompts, resizePrompt, rephrasePrompt, characterDescribePrompt
│   │           │                  # Validators: parseJson, reviewPlan, applyContinuity, numberPlan, reviewStyle, reviewCharacter
│   │           │                  # No fal calls; returns strings only.
│   │           ├── manual.ts      # Studio class: the step engine.
│   │           │                  # ManualTask shape: key, stage, kind, title, hint, model, modelNote,
│   │           │                  #   prompt (system+user joined with ---), promptPlaceholders, params,
│   │           │                  #   refs (ordered, with notes), slot, asset, want, shape, helpers,
│   │           │                  #   optional, render, block, shot, muted, done, warn.
│   │           │                  # TaskHelper shape: title, note, model, prompt, promptPlaceholders.
│   │           │                  # Studio methods: submit/skip/attach/sync/clear/setLine/demote/rescene/plainly/mute/confirmShot/build
│   │           │                  # Spec.checked: set by confirmShot(), reset when a shot is cleared.
│   │           ├── pipeline.ts    # Model endpoint constants, prompt builder functions (re-exported),
│   │           │                  # Spec type (with key, clip, checked, keep_sound, rescened, plain fields),
│   │           │                  # timeline(), buildSpecs(), syncSpecs(), shotNeed(), filmLength(), musicLength()
│   │           ├── render.ts      # renderKit(): produces ffmpeg commands, filter files, render.ps1, render.sh
│   │           │                  # for the local edit step; also generates subtitles.ass/srt via subtitles.ts
│   │           ├── store.ts       # IndexedDB v2 (films/blobs/keyval stores), saveRecord/loadRecord/allRecords,
│   │           │                  # blobGet/blobPut, kvGet/kvPut, cacheGet/cacheSet
│   │           ├── subtitles.ts   # ASS and SRT subtitle generation from script + narration durations
│   │           ├── voices.ts      # Voice catalog helpers: curated(), facets(), search(), sample(), preview()
│   │           └── work.ts        # estimateWork(): counts steps per film length for the form footer
│   ├── .oxlintrc.json             # Oxlint configuration
│   ├── index.html                 # HTML entry point
│   ├── package.json               # Frontend dependencies and npm scripts
│   ├── tsconfig.json              # TypeScript root configuration
│   ├── tsconfig.app.json          # TypeScript app compilation options
│   └── vite.config.ts             # Vite configuration with Tailwind and path aliases
├── share/                         # Cloudflare Worker API for film sharing (optional)
│   ├── src/
│   │   ├── index.ts               # Worker router, rate limiter, D1 query, R2 asset upload
│   │   └── voices.ts              # Voice search and filtering logic
│   ├── schema.sql                 # D1 SQLite schema (films, reports tables & indices)
│   ├── package.json               # Worker dependencies and scripts
│   ├── tsconfig.json              # TypeScript configuration for Workers
│   └── wrangler.jsonc             # Cloudflare Worker configuration & resource bindings
└── README.md                      # Project documentation and setup guide
```

## Architectural Highlights

- **Manual workbench, not an orchestrator**: The browser never calls any AI endpoint. `studio/manual.ts` (`Studio` class) reads `FilmRecord.state` and returns a list of `ManualTask` objects describing what to do next. The user does the work outside the browser; results come back as files in a local folder or via drag-drop.
- **Local media references**: Everything produced by the user is stored as a path relative to the project folder and referenced as a `local:<project>/<path>` string. `assets.ts` resolves these to object URLs on demand. Never pass a `local:` string directly to `<img src>` or `<video src>` — use `useMediaUrl(ref)` or the `Art` component from `lightbox.tsx`. In `Preview` inside `task-card.tsx` always build the ref as `` `local:${projectRoot}/${asset.path}` ``, not `local:${asset.path}` alone, because `asset.path` is relative to the project folder, not the root.
- **Duration drives everything**: Timeline slot lengths, score duration, subtitle timing, and shot duration requests are all computed from measured narration and clip durations. `measure()` in `assets.ts` is the single source of truth.
- **Prompts are joined, not split**: Every `ManualTask.prompt` combines the system prompt and the user prompt in one string, separated by `\n\n---\n\n`. There is no separate `system` field on `ManualTask` or `TaskHelper`. Use the `joined(system, user)` helper in `manual.ts` when building tasks.
- **Idempotent steps**: Every step in `manual.ts` checks whether its output asset is already present before asking for anything. Dropping a file, using the folder binding, and resuming after a reload all follow the same path.
- **QC on V/tail shots**: Shot tasks for non-talking shots carry a `warn` when `spec.checked` is not set. The user visually inspects the result and clicks "Looks good" which calls `Studio.confirmShot(shot)`, setting `spec.checked = true` and clearing the warning. Redo resets `checked`.
- **Navigation**: `studio-panel.tsx` gives every stage section an `id="stage-<key>"` and every task wrapper an `id="task-<key>"`. `SectionNav` renders a sticky left nav with these ids as targets, and an `IntersectionObserver` tracks which id is in the upper viewport to highlight the active item.
- **Local edit**: `render.ts` generates the full ffmpeg command sequence and filter graphs from `timeline()` in `pipeline.ts`. The render scripts (`render.ps1`, `render.sh`) and filter files are written into the project folder; no fal service is involved.
- **Optional Serverless Backend**: `share/` operates as an independent microservice for publishing, community browsing and moderation. The frontend is fully functional without it. Sharing requires the media to be at a public URL; films whose media lives only in a local folder cannot be shared.
- **Separation of Components**:
  - `components/app/` holds domain-specific Storycast UI logic.
  - `components/motion/` holds reusable visual and animation primitives independent of domain logic.
  - `components/agents/` handles prompt inspection and agent interaction patterns.
