import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./index.ts"],
  platform: "node",
  clean: true,
  dts: true,
  sourcemap: true,
});
