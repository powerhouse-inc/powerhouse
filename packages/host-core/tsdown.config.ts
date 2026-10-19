import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

const shared = {
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
} as const;

export default defineConfig([
  // The Node CLI context (ph run): loaders and run records use node:fs/url.
  {
    ...shared,
    entry: ["src/index.ts", "src/runners/compound.ts"],
    platform: "node",
  },
  // Browser-safe entries (reactor-monitor, Connect): scripts/assert-neutral.mjs
  // fails the build if any of their chunks imports a `node:` module.
  {
    ...shared,
    entry: ["src/schema.ts", "src/projection.ts", "src/plugins.ts"],
    platform: "neutral",
    // Same file names as the node build (package.json exports point there).
    outExtensions: () => ({ js: ".mjs", dts: ".d.mts" }),
  },
]);
