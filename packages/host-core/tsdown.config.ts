import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: ["src/index.ts", "src/runners/compound.ts"],
  outDir: "dist",
  // host-core runs in the Node CLI context (ph run) — loaders use node:fs/url.
  platform: "node",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
