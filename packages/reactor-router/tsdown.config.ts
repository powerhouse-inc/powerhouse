import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

// Platform-neutral: a Connect tab and a Switchboard process are both expected
// consumers (plan stage 4), and the router itself touches no host API.
export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
