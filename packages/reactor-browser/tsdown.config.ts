import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./index.ts"],
  platform: "browser",
  clean: true,
  dts: true,
  sourcemap: true,
});
