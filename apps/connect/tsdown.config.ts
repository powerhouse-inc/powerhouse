import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.tsx", "src/pglite.worker.ts"],
  platform: "browser",
  outDir: "dist",
  clean: true,
  dts: { build: true },
  sourcemap: true,
});
