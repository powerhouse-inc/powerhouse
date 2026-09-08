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
    // Browser-safe deep entries: Connect imports these directly so they don't
    // pull the registry barrel's node:fs helpers into the browser bundle.
    "registry/manifest-slim.ts",
    "registry/package-spec.ts",
    "registry/urls.ts",
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

// Keep the document-model declaration self-contained. The shared multi-entry
// declaration build places its public types in a private, content-hashed chunk,
// which makes inferred exports in downstream packages fail with TS2742.
await build({
  entry: ["document-model/index.ts"],
  outDir: "dist/document-model",
  platform: "neutral",
  clean: false,
  dts: { emitDtsOnly: true },
  sourcemap: true,
  deps: {
    neverBundle: [/^node:.*/],
  },
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
    "clis/file-system/get-config-strict.ts",
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
