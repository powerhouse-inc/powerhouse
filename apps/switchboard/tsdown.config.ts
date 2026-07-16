import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.mts",
    "src/server.mts",
    "src/utils.mts",
    "src/install-packages.mts",
    "src/migrate.mts",
    // Standalone entry: executor worker threads import it by absolute path.
    "src/worker-support.mts",
  ],
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
