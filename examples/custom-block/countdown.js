// A custom block. Render it with:
//   clipframe render examples/custom-block/project.json --blocks examples/custom-block/countdown.js
//
// A plugin's default export is a function that receives the Clipframe plugin API
// (zod as `z`, `defineBlock`, and all engine and drawing helpers) and returns a block definition.
// Keep the file self-contained: it is loaded straight into the browser, so it cannot import packages.
export default ({ z, defineBlock, font, rgba, spring, drawBackdrop }) =>
  defineBlock({
    id: "countdown",
    name: "Countdown",
    summary: "Numbers count down to a launch message",
    category: "text",
    defaultDuration: 4,
    schema: z.object({
      from: z.number().int().min(1).max(10).default(3).describe("Start number"),
      message: z.string().default("Launch!").describe("Shown after zero"),
    }),
    render(r) {
      const { ctx, props, theme, t, width, height, unit, duration } = r;
      drawBackdrop(r);
      const step = (duration * 0.75) / props.from;
      const i = Math.floor(t / step);
      const label = i < props.from ? String(props.from - i) : props.message;
      const local = i < props.from ? t - i * step : t - props.from * step;
      const s = spring(local, { stiffness: 260, damping: 14 });
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(0.5 + 0.5 * s, 0.5 + 0.5 * s);
      ctx.fillStyle = i < props.from ? theme.text : theme.primary;
      ctx.font = font(800, (i < props.from ? 360 : 140) * unit, theme.font);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0, width * 0.9);
      ctx.restore();
      // progress ring
      ctx.strokeStyle = rgba(theme.secondary, 0.6);
      ctx.lineWidth = 10 * unit;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 300 * unit, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t / (duration * 0.75)));
      ctx.stroke();
    },
  });
