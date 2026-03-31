import { build } from "tsdown";

await build({
  entry: [
    "index.ts",
    "constants.ts",
    "analytics/index.ts",
    "connect/index.ts",
    "document-model/index.ts",
    "document-drive/index.ts",
    "processors/index.ts",
    "registry/index.ts",
  ],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: true,
  sourcemap: true,
});

await build({
  entry: ["clis/index.mts"],
  outDir: "dist/clis",
  platform: "node",
  dts: true,
  sourcemap: true,
});
