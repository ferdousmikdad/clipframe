# HTML, CSS and Tailwind in video

Any scene or overlay can be real HTML and CSS, with Tailwind v4 compiled in the browser. You get flexbox, grid, gradients, shadows, `backdrop-filter`, 3D transforms, web fonts and CSS `@keyframes`, rendered frame-exact in the player, in browser export and in the CLI.

![HTML example](images/html.gif)

## In a project (JSON)

```json
{
  "id": "s1",
  "block": "html",
  "duration": 4,
  "props": {
    "tailwind": true,
    "html": "<div class=\"h-full grid place-items-center\"><h1 class=\"rise text-[140px] font-extrabold\">Hello <span class=\"text-violet-400\">HTML</span></h1></div>",
    "css": ".rise{animation:rise .8s cubic-bezier(.2,.8,.2,1) both}@keyframes rise{from{opacity:0;transform:translateY(60px)}}"
  }
}
```

| Block | Use |
|---|---|
| `html` | A full scene. Its background defaults to the theme background. |
| `html-overlay` | Drawn over the scenes, transparent around your HTML. Use it for badges, captions, progress bars and lower thirds. |

Props: `html`, `css`, `tailwind` (true/false), `fonts` (extra font stylesheet URLs). `html` scenes also take `background`.

### Layout size

Lay out at **1080p size**, whatever you export: 1920×1080 for 16:9, 1080×1920 for 9:16, 1080×1080 for 1:1. A 720p export scales the same layout down, so use `px` freely. The root fills the frame (`height:100%` works).

### Time in CSS

- `@keyframes` animations play on the video's clock: each frame shows each animation at exactly that moment, delays included.
- These variables are set on the root for every frame:

| Variable | Value |
|---|---|
| `--t` | Seconds since the scene started (a plain number, so use it in `calc()`) |
| `--p` | Progress through the scene, 0 to 1 |
| `--duration` | Scene length in seconds |
| `--primary`, `--secondary`, `--background`, `--text`, `--radius`, `--font` | The project theme |

```css
.bar { width: calc(var(--p) * 100%); }                    /* fills over the scene */
.spin { transform: rotate(calc(var(--t) * 90deg)); }        /* 90° per second */
```

### Images and fonts

- Project images: `<img src="asset:shot">` or `background-image: url(asset:shot)`.
- Web images and fonts are fetched once and embedded. The server must allow CORS. Google Fonts does.
- Bundled fonts (Inter, Poppins, Hind Siliguri, Noto Sans Bengali) are available by name.
- Other fonts come from stylesheet links:

```json
"fonts": ["https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap"]
```

Clipframe waits until every font the frame uses has loaded before it captures the frame, so no frame is ever drawn with a stand-in font.

## In code: `defineHtmlBlock` (Remotion-style)

For logic such as counters, data or anything computed, write a block whose HTML comes from a function that runs on every frame:

```js
export default ({ z, defineHtmlBlock, interpolate, easings }) =>
  defineHtmlBlock({
    id: "price-reveal",
    name: "Price reveal",
    summary: "A price counts up",
    category: "data",
    defaultDuration: 4,
    schema: z.object({ price: z.number().default(29) }),
    tailwind: true,
    html: (p, f) => {
      const n = Math.round(p.price * interpolate(f.t, [0.2, 1.6], [0, 1], easings.outCubic));
      return `<div class="h-full grid place-items-center text-[220px] font-extrabold">$${n}</div>`;
    },
  });
```

`f` has `t`, `progress`, `duration`, `time`, `width`, `height` (design size) and `theme`. See [examples/html-css/price.js](../examples/html-css/price.js).

### React components

Render your component to a string for each frame:

```tsx
import { renderToStaticMarkup } from "react-dom/server";

const title = defineHtmlBlock({
  id: "react-title", name: "React title", summary: "A React component", category: "text", defaultDuration: 3,
  schema: z.object({ text: z.string().default("Hello") }),
  tailwind: true,
  html: (p, f) => renderToStaticMarkup(<Title text={p.text} t={f.t} />),
});
```

Each frame is a fresh render with `t` as a prop. Animate from `t` (for example with `interpolate` or `spring`), not from `useState`, `useEffect` or timers, the same rule Remotion uses.

## Limits

- **No JavaScript inside the HTML.** `<script>` tags are removed. Put logic in a `defineHtmlBlock` function instead.
- **No `<video>`, `<iframe>` or `<canvas>` inside the HTML.** For footage, use a `video` scene with an `html-overlay` on top.
- **CSS transitions don't run,** because nothing changes state. Use `@keyframes`, `--t` or `--p` instead.
- **Animations on `::before` / `::after` are not time-shifted.** Animate real elements.
- **Export needs Chrome or Edge,** the same as the rest of Clipframe.

## How it works

Each frame becomes an SVG `<foreignObject>` holding your HTML, the compiled CSS and the embedded fonts and images. Clipframe loads it as an image, waits until its fonts have ink, then draws it into the frame. Every element with an animation gets `animation-delay: <its delay − t>` and is paused, so the browser's own CSS engine computes the exact frame. Export waits for each frame (the block's `prepare` step), so the file is exact. The player shows the newest finished frame while the next one is made.
