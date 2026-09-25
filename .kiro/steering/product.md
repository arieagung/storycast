# Product Overview: Storycast

**Storycast** ("Type a topic. Get a story.") is a manual AI film studio. The app works out every prompt, every reference and every cut of a narrated animated short film and hands them to the user one step at a time. The user runs the models with whatever services they have access to, saves the results to a local folder, and the app picks up from there.

## Core Value Proposition

Users select a topic, choose or customize a narrator character, pick a visual style, voice, and desired length (1 to 10 minutes). The app then acts as director, continuity supervisor and editor: it writes the full system prompt and user prompt for each AI step, lists the reference files in the exact order the prompt addresses them, names the file and folder where the result must be saved, and describes the fal.ai endpoint the pipeline was originally written for so the user knows which of their own models to reach for.

No API key is required. No AI is called from the browser.

## Key Features

- **Characters & Narrators**: 50 pre-built character narrators (with static model sheets and hero portraits), plus support for inventing new characters or uploading custom character images.
- **Visual Styles**: 26 illustrated looks (claymation, watercolor anime, comic ligne claire, crayon, marker sketch, gouache storybook, etc.) or a custom user illustration.
- **Multilingual**: Supports film narration and scripts across 74 languages.
- **Manual Workbench**: Each step shows the fal endpoint it was written for, the full system prompt and user prompt verbatim, all non-prompt parameters, the numbered reference files ready to download, and the expected output filename.
- **Project Folder**: The user chooses a working folder once (File System Access API). Each film gets its own subfolder. Files saved under the expected name are found and measured on their own; the app re-checks on every tab focus.
- **Iterative Steps**: On-camera lines outside 5.2–14.6 s can be rewritten in place. Refused scenes can be rewritten. Keyframes can be forced without the narrator. Shot audio can be kept or dropped per shot.
- **Local Edit**: The assemble step produces `render.ps1`, `render.sh`, `subtitles.ass`, `subtitles.srt` and two ffmpeg filter files. One command runs the full cut, mix and subtitle burn-in locally with ffmpeg.
- **Subtitle generation**: Subtitles are generated from the script and measured narration lengths (ASS + SRT), not transcribed from the finished film, so the words are always exact.
- **Agent Interoperability**: Every film page provides a "Copy agent prompt" action with the full pipeline brief filled in with topic, look, narrator and voice, naming which fal endpoint each step was written for.
- **Community Sharing (Optional)**: Optional serverless sharing system allows users to publish finished films whose media is already publicly hosted to a shared explore gallery, with moderation, rate limits and Turnstile verification. Films in a local folder cannot be shared.
