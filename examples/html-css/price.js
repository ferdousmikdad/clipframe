// A code-driven HTML block: the `html` function runs for every frame, like a Remotion component.
// Render with: clipframe render examples/html-css/project.json --blocks examples/html-css/price.js
export default ({ z, defineHtmlBlock, interpolate, easings }) =>
  defineHtmlBlock({
    id: "price-reveal",
    name: "Price reveal",
    summary: "A price counts up, then a ribbon drops in",
    category: "data",
    defaultDuration: 4,
    schema: z.object({
      price: z.number().default(29),
      plan: z.string().default("Pro"),
      per: z.string().default("/ month"),
    }),
    tailwind: true,
    html: (p, f) => {
      const n = Math.round(p.price * interpolate(f.t, [0.2, 1.6], [0, 1], easings.outCubic));
      const drop = interpolate(f.t, [1.6, 2.2], [-140, 0], easings.outBack);
      const show = interpolate(f.t, [1.6, 1.9], [0, 1]);
      return `
        <div class="h-full w-full grid place-items-center bg-[radial-gradient(circle_at_30%_20%,#3b0764,transparent_60%)]">
          <div class="relative rounded-[48px] border border-white/15 bg-white/5 px-32 py-20 text-center shadow-2xl backdrop-blur">
            <div class="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-8 py-3 text-3xl font-extrabold text-black"
                 style="transform: translate(-50%, ${drop}px); opacity: ${show}">Most popular</div>
            <p class="text-4xl font-semibold uppercase tracking-[0.3em] text-violet-300">${p.plan}</p>
            <p class="mt-6 text-[220px] leading-none font-extrabold tabular-nums">$${n}</p>
            <p class="mt-4 text-4xl text-white/60">${p.per}</p>
          </div>
        </div>`;
    },
  });
