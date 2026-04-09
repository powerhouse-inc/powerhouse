import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./index.ts"],
  platform: "neutral",
  clean: true,
  dts: true,
  sourcemap: true,
});
