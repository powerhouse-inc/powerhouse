import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["start-connect.tsx", "main.tsx", "pglite.worker.ts"],
  platform: "browser",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
