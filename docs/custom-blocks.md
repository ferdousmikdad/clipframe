# Custom blocks

A block is a schema plus a `render` function that draws one frame on a Canvas 2D context.

```js
export default ({ z, defineBlock, font, rgba, spring, interpolate, easings, drawBackdrop, drawIcon, roundedRect }) =>
  defineBlock({
    id: "big-number",                 // kebab-case, unique
    name: "Big number",
    summary: "One huge number with a label", // one line; an AI reads this
    category: "data",                 // media · text · ui · data · brand · background · overlay
    defaultDuration: 3,
    schema: z.object({
      value: z.number().default(42).describe("The number"),
      label: z.string().default("").describe("Under the number"),
    }),
    render(r) {
      const { ctx, props, theme, t, progress, width, height, unit, duration } = r;
      drawBackdrop(r);                                   // the theme's soft gradient background
      const n = Math.round(props.value * interpolate(t, [0, 1.2], [0, 1], easings.outCubic));
      ctx.fillStyle = theme.text;
      ctx.font = font(800, 300 * unit, theme.font);      // sizes are px at 1080p × unit
      ctx.textAlign = "center";
      ctx.fillText(String(n), width / 2, height / 2);
      ctx.fillStyle = rgba(theme.text, 0.7);
      ctx.font = font(400, 48 * unit, theme.font);
      ctx.fillText(props.label, width / 2, height / 2 + 120 * unit);
    },
  });
```

## What `render` gets

| | |
|---|---|
| `ctx` | Canvas 2D context (state is saved and restored around each block) |
| `props` | The scene's props with the schema's defaults filled in |
| `theme` | `primary`, `secondary`, `background`, `text`, `font`, `radius` |
| `t` | Seconds since the scene started. During an outgoing transition it keeps running past `duration` |
| `progress` | `t / duration`, clamped to 0–1 |
| `time` | Seconds since the start of the video |
| `width`, `height` | Canvas size in pixels |
| `unit` | `min(width, height) / 1080`. Multiply sizes by it so 720p and 1080p look the same |
| `orientation` | `"landscape"`, `"portrait"` or `"square"` |
| `assets` | `assets.get(id)` for images, `assets.video?.(id)` for video frames |
| `random()` | Random numbers seeded by the scene id, so they are the same every frame and every render |

## Rules for matching preview and export

- Draw only from `t`, `props` and `theme`. Do not keep state between calls, and do not use `Date.now()` or `Math.random()`. Use `r.random()` instead.
- Draw synchronously, with no `await`.
- Use `unit` for every size.

## Helpers in the API

`z` (zod), `defineBlock`, easing (`easings`, `interpolate`, `spring`, `stagger`, `lerp`, `clamp`), the Remotion-style `motion` namespace (`motion.interpolate`, `motion.spring`, `motion.Easing`…), colour (`rgba`, `mix`, `contrastText`), drawing (`roundedRect`, `withShadow`, `linearGradient`, `radialGradient`, `drawImageFit`, `wrapText`, `fitFontSize`, `font`), and block parts (`drawBackdrop`, `drawIcon` with every Lucide icon, `drawCard`, `drawIconTile`, `drawFrame`, `drawPlaceholder`, `enter`).

## Using it

From the command line:

```bash
clipframe render project.json --blocks big-number.js
```

The file is loaded straight into the browser, so it has to be self-contained: no `import` of packages, and everything comes from the API argument.

In your own code, import the block or the factory:

```ts
import { createBuiltinRegistry, resolvePluginExport } from "clipframe";
import bigNumber from "./big-number.js";

const registry = createBuiltinRegistry();
for (const b of resolvePluginExport(bigNumber, "big-number.js")) registry.add(b);
// pass `registry` to createPlayer / renderToMp4
```
