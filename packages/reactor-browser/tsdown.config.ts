import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  platform: "browser",
  clean: true,
  dts: { build: true },
  sourcemap: true,
  unbundle: true,
});
