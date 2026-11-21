import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { index: resolve(__dirname, "index.html"), playground: resolve(__dirname, "playground.html") } },
  },
});
