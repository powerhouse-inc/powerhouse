import { build } from "tsdown";

await build({
  entry: [
    "index.ts",
    "constants.ts",
    "analytics/index.ts",
    "connect/index.ts",
    // Config loader + single JSON adapter. node:fs is dynamically imported
    // inside the adapter's read/write methods so neither file appears in the
    // browser bundle's static import graph.
    "connect/config-loader.ts",
    "connect/json-adapter.ts",
    "document-model/index.ts",
    "document-model/utils.ts",
    "document-model/mock.ts",
    "document-drive/index.ts",
    "processors/index.ts",
    "registry/index.ts",
  ],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: true,
  sourcemap: true,
  deps: {
    neverBundle: [/^node:.*/],
  },
});

await build({
  entry: ["clis/index.mts"],
  outDir: "dist/clis",
  platform: "node",
  clean: false,
  dts: true,
  sourcemap: true,
});

// Sub-paths so cli.ts and command files can import only what they need
// without pulling the full clis bundle on the cold path.
await build({
  entry: ["clis/args/*.ts"],
  outDir: "dist/clis/args",
  platform: "node",
  clean: false,
  dts: true,
  sourcemap: true,
});

await build({
  entry: [
    "clis/constants.ts",
    "clis/utils.ts",
    "clis/command-names.ts",
    "clis/services/telemetry.ts",
    "clis/build-config.mts",
  ],
  outDir: "dist/clis",
  platform: "node",
  clean: false,
  dts: true,
  sourcemap: true,
});
