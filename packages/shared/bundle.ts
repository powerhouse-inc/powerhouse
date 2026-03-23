import { build } from "tsdown";

await build({
  entry: [
    "analytics/index.ts",
    "connect/index.ts",
    "document-model/index.ts",
    "document-drive/index.ts",
    "processors/index.ts",
    "registry/index.ts",
    "constants.ts",
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
