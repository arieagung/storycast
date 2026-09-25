<p align="center">
  <img src="web/public/logo.svg" width="72" alt="Storycast" />
</p>

<h1 align="center">Storycast</h1>

<p align="center">
  <b>Type a topic. Get a story.</b><br />
  Pick a character, give it a topic, and Storycast works out every prompt, every reference and every cut of a narrated
  animated film. You run the models.
</p>

<p align="center">
  <img src=".github/assets/home.jpg" alt="Storycast home" />
</p>

## What it makes

A character narrates a short film that explains a topic: a script, keyframes, animated shots, on-camera lines, narration,
a score, a hand-lettered end card and word-by-word subtitles. 50 ready narrators, 26 illustrated looks, 74 languages,
1 to 10 minutes long. You can also invent a character, upload your own, or bring your own illustration style.

<table>
  <tr>
    <td width="33%"><img src="web/public/static/posters/10a4f1dd.jpg" alt="Nib and the stick inside the pencil" /><br /><sub><b>Nib</b> and the stick inside the pencil · Claymation</sub></td>
    <td width="33%"><img src="web/public/static/posters/18d77a9d.jpg" alt="Kiko and the secret life of lightning" /><br /><sub><b>Kiko</b> and the secret life of lightning · Watercolor anime</sub></td>
    <td width="33%"><img src="web/public/static/posters/2bf0760f.jpg" alt="Stella and the very first newspapers" /><br /><sub><b>Stella</b> and the very first newspapers · Comic ligne claire</sub></td>
  </tr>
</table>

## How it works

This is a manual studio. Nothing is generated for you and no API key is needed: the app is the director, the continuity
supervisor and the editor, and it hands you one step at a time.

Every step shows you:

- the **fal endpoint the original pipeline called**, so you know which of your own models to reach for;
- the **full system prompt and prompt**, verbatim, plus the non-prompt parameters (`image_size`, `duration`,
  `resolution`, `stability`, `language_code` and the rest);
- the **reference files in the order the prompt talks about them** — Image 1, Image 2, Image 3 — ready to download;
- the **file name and folder** the result has to be saved under.

You take that to whichever service you use, generate the thing, and save it where the step asked. The app finds the
file, measures it, and works out what comes next.

### The one thing that needs a click

A browser may not read your disk unbidden. Choose a working folder once on the Create page and Storycast reads it from
then on: every file you save under the name a step asked for is picked up and measured on its own, each time you come
back to the tab. Without a folder you can still drop files onto their step and the app keeps a copy itself, which is
easier to lose.

Lengths are measured, never typed. They decide everything downstream: whether an on-camera line fits, how long a shot
has to be, how long the score runs, where every cut falls and when each subtitle word lights up.

### The steps

1. **Your images.** Only when you bring your own look or your own character: a vision model describes them, and you
   paste the JSON back. The `anchor` sentence you get is appended to every image prompt in the film.
2. **Script.** The director writes the whole film as one JSON object. Storycast validates it, tells you where it drifted
   from the brief, and numbers the blocks. An optional second pass smooths the jumps between scenes; skip it and the
   script is used as written.
3. **Character.** A model sheet and a hero portrait, the two references every later frame leans on. Skipped entirely for
   the 50 ready narrators, which already have both.
4. **Narration.** One recording per block. On-camera lines have to last 5.2–14.6 s; if one does not, rewrite it in place
   and record again, or turn the block into a voice-over, which is what the original did automatically.
5. **Keyframes.** The opening frame of every shot, one per block plus the final shot.
6. **Shots.** Voice-over blocks become animated shots with a target length; on-camera blocks are lip-synced to their
   recording. Each shot can be redone, and each can keep or drop its own sound in the mix.
7. **Score.** One instrumental bed, its length worked out from the narration.
8. **End card.** The final keyframe with the title lettered into the calm space at the top. Also the film's poster.
9. **Edit.** No models here. Storycast writes `render.ps1`, `render.sh`, `subtitles.ass`, `subtitles.srt` and the two
   ffmpeg filter files into the folder. Run one command; you get `film.mp4` and `clean.mp4`.

### Which model each step was written for

| Step | Original fal endpoint |
| --- | --- |
| Director, script editor | [`openrouter/router`](https://fal.ai/models/openrouter/router) with Claude Opus 5.5 |
| Reading your images | [`openrouter/router/vision`](https://fal.ai/models/openrouter/router/vision) |
| Model sheets, keyframes, end cards | [`openai/gpt-image-2.5/flare/text-to-image`](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image), [`openai/gpt-image-2.5/flare/edit`](https://fal.ai/models/openai/gpt-image-2.5/flare/edit) |
| Shots | [`minimax/h3-max/reference-to-video`](https://fal.ai/models/minimax/h3-max/reference-to-video) |
| On-camera lines | [`minimax/h3-max/lip-sync/image-to-video`](https://fal.ai/models/minimax/h3-max/lip-sync/image-to-video) |
| Narration | [`fal-ai/elevenlabs/tts/eleven-v3`](https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3) |
| Score | [`elevenlabs/music/v2.5`](https://fal.ai/models/elevenlabs/music/v2.5) |
| Edit, mix, subtitles | was `fal-ai/ffmpeg-api` and `fal-ai/workflow-utilities`; now ffmpeg on your machine |

### What the edit does differently

The cut is the same arithmetic the original used, with two deliberate improvements that come free from doing it locally:

- A shot that came back shorter than its slot is held on its last frame to fill it. fal's merge just made the film
  shorter, and everything after it drifted out of sync with the narration.
- Subtitles are written from the script and the measured narration lengths instead of being transcribed back out of the
  finished film. The words are already known, so they are exact.

Shot audio is left out of the mix by default. Video models tend to mumble, and the original needed a source-separation
pass to strip that speech out before it could use a shot's sound. Listen to a shot and turn its sound on if it is clean.

### Your folder

```
<your folder>/
└── how-do-bees-make-honey-4f2a/
    ├── input/        style.png, character.png        (only what you uploaded)
    ├── character/    sheet.png, hero.png
    ├── narration/    B01.mp3, B02.mp3, …             one per block
    ├── keyframes/    S01.png, T02.png, …             one per shot
    ├── shots/        S01.mp4, T02.mp4, …
    ├── music/        score.mp3
    ├── endcard/      card.png
    ├── build/        cuts and the two ffmpeg filter files
    ├── subtitles.ass, subtitles.srt
    ├── render.ps1, render.sh
    └── film.mp4, clean.mp4
```

Any common extension works: `png` `jpg` `jpeg` `webp` for images, `mp3` `wav` `m4a` `aac` `ogg` `flac` `opus` for
audio, `mp4` `webm` `mov` `mkv` `m4v` for video. Only the name before the dot has to match.

### Running the edit

You need [ffmpeg](https://ffmpeg.org/download.html) on your PATH, built with libass for the subtitle step (the usual
Windows and Homebrew builds are). Then, inside the film's folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\render.ps1
```

```bash
bash render.sh
```

The script prints each step, stops on the first failure, and leaves `film.mp4` (with subtitles) and `clean.mp4`
(without) next to itself. Drop them back onto the last step and the film page can toggle subtitles off.

### Make one with your agent

Every page has a **Copy agent prompt** button. It copies the whole pipeline as a brief, filled in with the page's topic,
look, narrator and voice, and naming the endpoint each step was written for, so a coding agent can make the film with
whatever models it can reach.

## Run locally

```bash
cd web && npm install && npm run dev
```

Choose a working folder in the app and start a film. Edge and Chrome can bind a folder; other browsers fall back to
dropping files onto each step.

## Deploy

`web/` is a static Vite site. Deploy it to any static host (on Vercel: root `web/`).

### Sharing (optional)

`share/` is a Cloudflare Worker with D1 and R2. Without it, sharing is hidden, and the Explore gallery shows only the
films that ship with the app. It can publish films whose media is already on the web; films that live in your own folder
cannot be shared, because there is no URL to hand it.

```bash
cd share && npm install && npx wrangler login
npx wrangler d1 create storycast
npx wrangler r2 bucket create storycast-media
npx wrangler d1 execute storycast --remote --file schema.sql
npx wrangler turnstile widget create storycast-share --domain <your site host> --mode managed
```

Put the database id and your site's address (`ALLOWED_ORIGINS`) into `share/wrangler.jsonc`, then:

```bash
npx wrangler secret put IP_SALT
npx wrangler secret put TURNSTILE_SECRET
npx wrangler deploy
```

Set `VITE_SHARE_API` and `VITE_TURNSTILE_SITE_KEY` for the site build (see `web/.env.example`) and redeploy. The worker
also serves the voice library, which is how the app can offer more than the twelve voices in its own catalog.

To publish a story sent to Explore:

```bash
npx wrangler d1 execute storycast --remote --command "UPDATE films SET status = 'public' WHERE id = '<story id>'"
```
