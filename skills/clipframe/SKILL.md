---
name: clipframe
description: Make MP4 videos from a JSON project with Clipframe (free, MIT-licensed, no seat or render fees). Use when the user asks for a product promo, launch video, app demo, social reel / Short / TikTok, explainer, animated announcement or any programmatic video, including videos built from HTML, CSS or Tailwind. Renders locally with headless Chrome.
---

# Clipframe: make a video

Clipframe turns a JSON project into an MP4. A project is a list of scenes; each scene is a ready-made block (titles, UI mockups, cursor clicks, stats, pricing, testimonials, outros, video clips) or an HTML/CSS/Tailwind scene. Music, voice-over and sound effects are part of the same file.

## Setup (once)

Needs Node 20+ and Google Chrome (or `npx playwright install chromium`).

```bash
npx -y github:ferdousmikdad/clipframe --version   # first run installs and builds (~1 min)
```

Use `npx -y github:ferdousmikdad/clipframe <command>` everywhere below (call it `clipframe`). If the MCP tools `clipframe_guide`, `render_still`, `render_video` are available, prefer them; they do the same things.

## Workflow

1. **Plan** the video with the user in one line: purpose, format (9:16 for Reels/Shorts/TikTok, 1:1 or 4:5 for feeds, 16:9 for YouTube/web), length, brand colours, any screenshots/logo/music they have.
2. **Write `project.json`** in a new folder. Put the user's files in `assets/` next to it and reference them in `assets` (`"file": "assets/shot.png"`). Read `references/blocks.md` for block props, `references/project-format.md` for the format and `references/html.md` for HTML scenes.
3. **Check**: `clipframe validate project.json`. Fix every error it prints (they name the exact field).
4. **Look** at a few frames: `clipframe still project.json -t 2 -o check.png`, then open/read the PNG. Fix overlapping or cut-off text, empty scenes, weak contrast.
5. **Render**: `clipframe render project.json -o video.mp4` (add `--resolution 720p` for a quick draft).
6. Tell the user where the MP4 is and offer changes; edit `project.json` and re-render.

## Good defaults

- 5–8 scenes of 2.5–4 s; transitions of 0.4–0.6 s (`fade`, `slide`, `zoom`, `wipe`) on most scenes; end with `logo-outro`.
- Strong opener: `title-reveal` or `kinetic-text`. Show the product with `ui-mockup` / `cursor-click` / `zoom-pan` on real screenshots.
- Theme colours from the brand; `background` dark for promos unless the brand is light. Fonts bundled: Inter, Poppins, Hind Siliguri, Noto Sans Bengali (or any Google Font in HTML scenes).
- For anything the blocks don't cover, use an `html` scene (HTML + CSS + `"tailwind": true`), laid out at 1080p size, animated with `@keyframes` or `var(--p)` (0–1 progress).

## Minimal project

```json
{
  "version": 1,
  "meta": { "name": "launch", "format": "9:16", "fps": 30, "resolution": "1080p" },
  "theme": { "primary": "#7C3AED", "secondary": "#22D3EE", "background": "#0B0B12", "text": "#FFFFFF", "font": "Inter", "radius": 16 },
  "assets": [],
  "scenes": [
    { "id": "s1", "block": "title-reveal", "duration": 3, "props": { "title": "Meet TaskFlow", "subtitle": "Plan less. Ship more." } },
    { "id": "s2", "block": "feature-grid", "duration": 4, "props": { "title": "Why teams switch", "items": [{ "icon": "zap", "title": "Fast", "text": "Opens in a blink." }, { "icon": "shield-check", "title": "Private", "text": "Your data stays yours." }] }, "transition": { "type": "slide", "duration": 0.5 } },
    { "id": "s3", "block": "logo-outro", "duration": 3, "props": { "brand": "TaskFlow", "text": "taskflow.app", "cta": "Start free" }, "transition": { "type": "fade", "duration": 0.5 } }
  ],
  "overlays": []
}
```

More: https://github.com/ferdousmikdad/clipframe · examples in the package's `examples/` folder.
