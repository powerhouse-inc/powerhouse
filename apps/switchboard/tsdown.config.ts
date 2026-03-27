import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/utils.ts",
    "src/install-packages.ts",
    "src/migrate.ts",
  ],
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
