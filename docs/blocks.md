# Built-in blocks

Generated from the block definitions by `npm run docs`. Fields marked `*` are required; everything else has a default.

Scenes play one after another. Blocks in the **overlay** group go in `overlays` with a `start` and `end` time and draw on top of the scenes.

## Media

### `video` · Video

```
video (media, default 5s) — A video clip: trim, speed, framing, zoom, colour
- asset: asset id — Video asset id
- start: number — Start this many seconds into the video (trim the beginning)
- speed: number = 1 — Playback speed (0.25–4)
- volume: number = 1 — Sound volume (0 = silent, 1 = original)
- mute: boolean = false — Turn the video's sound off
- fit: "cover"|"contain"|"blur" = "cover" — cover = fill and crop · contain = whole picture · blur = whole picture on a blurred copy
- zoomFrom: number = 1 — Zoom at the start (1 = none)
- zoomTo: number = 1 — Zoom at the end (slow push-in when larger than zoomFrom)
- focusX: number = 0.5 — Horizontal point to keep in frame (0 = left, 1 = right)
- focusY: number = 0.5 — Vertical point to keep in frame (0 = top, 1 = bottom)
- rotate: number|number|number|number — Rotate clockwise
- flipH: boolean = false — Mirror left–right
- flipV: boolean = false — Mirror top–bottom
- freeze: boolean = false — Hold one frame (the frame at Start) for the whole scene
- brightness: number = 1 — 1 = original
- contrast: number = 1 — 1 = original
- saturation: number = 1 — 0 = black and white, 1 = original
example: {"speed":1,"volume":1,"mute":false,"fit":"cover","zoomFrom":1,"zoomTo":1,"focusX":0.5,"focusY":0.5,"flipH":false,"flipV":false,"freeze":false,"brightness":1,"contrast":1,"saturation":1}
```

### `picture` · Picture

```
picture (media, default 4s) — A full-frame picture with a slow push-in (or a calm colour), for explainers and stories
- asset: asset id — Picture asset id (empty = colour only)
- color: string — Background colour (empty = the theme's background)
- accent: string — Glow colour of a colour-only scene (empty = the theme's primary)
- zoomFrom: number = 1.04 — Zoom at the start
- zoomTo: number = 1.14 — Zoom at the end
- pan: number = 1.5 — Sideways drift in % of the width (left → right)
- shade: boolean = true — Darken the top and bottom for text
example: {"zoomFrom":1.04,"zoomTo":1.14,"pan":1.5,"shade":true}
```

## Text

### `title-reveal` · Title Reveal

```
title-reveal (text, default 3s) — Big title + subtitle animated in
- title*: string — Main title
- subtitle: string — Smaller line under the title
- style: "rise"|"type"|"scale" = "rise" — Entrance animation
- align: "center"|"left" = "center" — Text alignment
- titleColor: hex color — Title color (default theme text)
- accentColor: hex color — Accent bar color (default theme primary)
example: {"title":"Your big idea","subtitle":"A short, punchy subtitle","style":"rise","align":"center"}
```

### `kinetic-text` · Kinetic Text

```
kinetic-text (text, default 4s) — Words/lines pop in one by one
- lines*: string[] — Lines shown in order
- emphasis: string[] — Words to highlight in the primary color
- mode: "stack"|"replace" = "stack" — stack: lines accumulate; replace: one line at a time
- textColor: hex color — Text color (default theme text)
- emphasisColor: hex color — Highlight color (default theme primary)
example: {"lines":["Plan less.","Ship more.","Smile often."],"emphasis":["Ship"],"mode":"stack"}
```

### `feature-callout` · Feature Callout

```
feature-callout (text, default 3s) — Icon + title + text card
- title*: string — Feature name
- text: string — One-line description
- icon: icon = "sparkles" — Lucide icon name, e.g. refresh-cw
- eyebrow: string — Small label above the title, e.g. NEW
example: {"title":"Auto-sync","text":"Every device, instantly.","icon":"refresh-cw"}
```

### `feature-grid` · Feature Grid

```
feature-grid (text, default 4s) — 2–6 feature cards appear staggered
- title: string — Optional heading above the grid
- items*: [{icon,title,text}] — Feature cards
example: {"title":"Everything you need","items":[{"icon":"zap","title":"Fast","text":"Loads in a blink."},{"icon":"shield-check","title":"Secure","text":"Private by default."},{"icon":"refresh-cw","title":"Synced","text":"On every device."}]}
```

### `testimonial` · Testimonial

```
testimonial (text, default 4.5s) — Quote + name + role (fictional in demos)
- quote*: string — The quote, without quote marks
- name: string — Person's name
- role: string — Role / company
- avatarAsset: asset id — Optional avatar image asset id
- rating: integer — Stars 0-5 (0 hides)
example: {"quote":"We shipped our launch video in an afternoon.","name":"Rina Das","role":"Founder, Northwind Labs","rating":5}
```

## Ui

### `ui-mockup` · UI Mockup

```
ui-mockup (ui, default 4s) — Screenshot in browser/phone/laptop frame
- asset: asset id — Screenshot image asset id
- frame: "browser"|"phone"|"laptop"|"none" = "browser" — Device frame
- motion: "slide-up"|"tilt"|"float" = "slide-up" — Camera motion
- url: string — Address bar text (browser frame)
- caption: string — Optional caption above the mockup
example: {"frame":"browser","motion":"slide-up"}
```

### `cursor-click` · Cursor Click

```
cursor-click (ui, default 4s) — Animated cursor moves and clicks on a screenshot
- asset: asset id — Screenshot image asset id
- path: [{x,y}] = [{"x":0.2,"y":0.3},{"x":0.6,"y":0.55}] — Cursor waypoints (0-1 of screenshot)
- clickAt: number[] — Click times in seconds (default: on arrival at each waypoint)
- frame: "browser"|"none" = "browser" — Frame around the screenshot
- url: string — Address bar text
example: {"path":[{"x":0.2,"y":0.3},{"x":0.6,"y":0.55}],"frame":"browser"}
```

### `zoom-pan` · Zoom & Pan

```
zoom-pan (ui, default 4s) — Zooms into a region of a screenshot
- asset: asset id — Screenshot image asset id
- from: {x,y,scale} = {"x":0.5,"y":0.5,"scale":1} — Start view
- to: {x,y,scale} = {"x":0.7,"y":0.35,"scale":2.2} — End view
- hold: number = 0.6 — Seconds to hold at each end
example: {"from":{"x":0.5,"y":0.5,"scale":1},"to":{"x":0.7,"y":0.35,"scale":2.2},"hold":0.6}
```

### `before-after` · Before / After

```
before-after (ui, default 4s) — Split comparison with slider wipe
- beforeAsset: asset id — Image shown on the left (before)
- afterAsset: asset id — Image shown on the right (after)
- labels: {before,after} = {"before":"Before","after":"After"} — Corner labels
example: {"labels":{"before":"Before","after":"After"}}
```

## Data

### `stats-counter` · Stats Counter

```
stats-counter (data, default 3.5s) — Numbers count up
- title: string — Optional heading
- items*: [{value,prefix,suffix,label}] — Stats
example: {"items":[{"value":10,"prefix":"","suffix":"k+","label":"Teams"},{"value":99.9,"prefix":"","suffix":"%","label":"Uptime"},{"value":4.9,"prefix":"","suffix":"/5","label":"Rating"}]}
```

### `pricing-card` · Pricing Cards

```
pricing-card (data, default 4s) — Plan cards slide in
- title: string — Optional heading
- plans*: [{name,price,period,features,highlight}] — 1-3 plans
example: {"title":"Simple pricing","plans":[{"name":"Starter","price":"$0","period":"/mo","features":["1 project","720p export"],"highlight":false},{"name":"Pro","price":"$12","period":"/mo","features":["Unlimited projects","1080p60 export","Brand themes"],"highlight":true},{"name":"Team","price":"$29","period":"/mo","features":["Everything in Pro","Shared library"],"highlight":false}]}
```

## Brand

### `logo-outro` · Logo Outro

```
logo-outro (brand, default 2.5s) — Logo/asset reveal + URL/CTA
- logoAsset: asset id — Logo image asset id (default: monogram)
- text: string — URL or tagline under the logo
- cta: string — Button label, e.g. Try it free
- brand: string — Brand name used for the monogram when no logo
example: {"text":"taskflow.app","cta":"Start free"}
```

## Background

### `background` · Background

```
background (background, default 3s) — Gradient/mesh/grid animated background (usable as scene)
- style: "gradient"|"mesh"|"grid"|"dots" = "mesh" — Background style
- colors: string[] — Up to 4 hex colors (default theme)
- text: string — Optional centered text
- textColor: hex color — Text color
example: {"style":"mesh"}
```

## Overlay

### `lower-third` · Lower Third

```
lower-third (overlay, default 4s) — Name/label bar
- title*: string — Main label, e.g. a name
- subtitle: string — Second line, e.g. a role
- position: "left"|"right" = "left" — Side of the screen
example: {"title":"Rina Das","subtitle":"Founder, Northwind Labs","position":"left"}
```

### `captions` · Captions

```
captions (overlay, default 6s) — Subtitle lines with timing
- lines*: [{text,start,end}] — Caption lines
- style: "box"|"outline"|"bold" = "box" — Look
- position: "bottom"|"middle"|"top" = "bottom" — Vertical position
example: {"lines":[{"text":"This is Clipframe.","start":0,"end":2},{"text":"Videos made by AI, on your machine.","start":2,"end":5}],"style":"box","position":"bottom"}
```

### `watermark` · Watermark

```
watermark (overlay, default 10s) — Corner logo
- logoAsset: asset id — Logo image asset id
- text: string — Text used when there is no logo
- position: "top-left"|"top-right"|"bottom-left"|"bottom-right" = "top-right" — Corner
- opacity: number = 0.8 — 0-1
- size: number = 0.1 — Height as fraction of the short side
example: {"text":"taskflow","position":"top-right","opacity":0.8,"size":0.1}
```
