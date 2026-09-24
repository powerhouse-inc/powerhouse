import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: [
    "src/index.mts",
    "src/server.mts",
    "src/utils.mts",
    "src/install-packages.mts",
    "src/migrate.mts",
  ],
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
