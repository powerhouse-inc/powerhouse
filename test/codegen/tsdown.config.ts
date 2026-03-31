import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["generate-test-projects.ts", "setup.ts", "utils.ts", "constants.ts"],
  outDir: "dist",
  platform: "node",
  clean: true,
  dts: false,
  sourcemap: true,
});
