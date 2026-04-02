import { defineConfig } from "tsdown";

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
  dts: true,
  sourcemap: true,
});
