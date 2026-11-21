// Bundle the page the CLI opens in headless Chrome (the browser exporter plus its dependencies).
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli/page.ts"],
  outfile: "dist/cli/page.js",
  bundle: true,
  format: "esm",
  target: "chrome110",
  minify: true,
  sourcemap: true,
  legalComments: "linked",
  logLevel: "warning",
});
console.log("built dist/cli/page.js");
