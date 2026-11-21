import { describe, expect, it } from "vitest";
import { builtinBlocks, compactBlockList, createBuiltinRegistry, defineHtmlBlock, describeBlock, pluginApi, resolvePluginExport } from "../src/index.js";
import { z } from "zod";

const BLOCKS = [
  "video", "title-reveal", "kinetic-text", "ui-mockup", "cursor-click", "zoom-pan", "feature-callout", "feature-grid",
  "stats-counter", "before-after", "testimonial", "pricing-card", "logo-outro", "background", "picture",
  "lower-third", "captions", "watermark", "html", "html-overlay",
];

describe("built-in blocks", () => {
  it("ships every block", () => {
    expect(builtinBlocks.map((b) => b.id).sort()).toEqual([...BLOCKS].sort());
  });

  it.each(builtinBlocks.map((b) => [b.id, b] as const))("%s has valid defaults and a one-line summary", (_id, b) => {
    expect(b.schema.safeParse(b.defaults).success).toBe(true);
    expect(b.summary).not.toMatch(/\n/);
    expect(b.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(describeBlock(b)).toContain(b.id);
  });

  it("produces a compact list for an AI", () => {
    const text = compactBlockList(createBuiltinRegistry());
    expect(text.split("\n")).toHaveLength(BLOCKS.length);
    expect(text).toContain("title-reveal — Big title + subtitle animated in — props: title*,subtitle,style");
  });

  it("loads plugin factories", () => {
    const [b] = resolvePluginExport(
      ({ z, defineBlock }: any) =>
        defineBlock({ id: "hello", name: "Hello", summary: "Hi", category: "text", defaultDuration: 2, schema: z.object({ text: z.string().default("hi") }), render() {} }),
      "hello.js",
    );
    expect(b.id).toBe("hello");
    expect(b.defaults).toEqual({ text: "hi" });
    expect(b.plugin).toBe("hello.js");
    expect(() => resolvePluginExport({ nope: true }, "bad.js")).toThrow(/bad\.js/);
  });

  it("loads the custom-block example", async () => {
    const mod = await import("../examples/custom-block/countdown.js");
    const [b] = resolvePluginExport(mod.default, "countdown.js");
    expect(b.id).toBe("countdown");
    expect(b.defaults).toEqual({ from: 3, message: "Launch!" });
  });
});

describe("html blocks", () => {
  it("html and html-overlay have a prepare step (exports wait for each frame)", () => {
    const r = createBuiltinRegistry();
    expect(typeof r.get("html")?.prepare).toBe("function");
    expect(r.get("html-overlay")?.category).toBe("overlay");
  });

  it("defineHtmlBlock makes a block with defaults and a prepare step", () => {
    const b = defineHtmlBlock({
      id: "tag",
      name: "Tag",
      summary: "A tag",
      category: "text",
      defaultDuration: 2,
      schema: z.object({ text: z.string().default("hi") }),
      html: (p, f) => `<b>${p.text} ${f.t}</b>`,
    });
    expect(b.defaults).toEqual({ text: "hi" });
    expect(typeof b.prepare).toBe("function");
    expect(pluginApi.defineHtmlBlock).toBe(defineHtmlBlock);
  });

  it("loads the html-css example's code block", async () => {
    const mod = await import("../examples/html-css/price.js");
    const [b] = resolvePluginExport(mod.default, "price.js");
    expect(b.id).toBe("price-reveal");
    expect(b.defaults).toEqual({ price: 29, plan: "Pro", per: "/ month" });
  });
});
