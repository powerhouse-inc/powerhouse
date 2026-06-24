import { defineConfig } from "tsdown";
export default defineConfig({
  entry: [
    "index.ts",
    "document-models/index.ts",
    "document-models/*/index.ts",
    "editors/index.ts",
    "editors/*/index.ts",
    "processors/index.ts",
    "processors/*/index.ts",
    "codegen/index.ts",
    "codegen/spec.ts",
    "powerhouse.manifest.json",
  ],
  platform: "neutral",
  outDir: "dist",
  deps: {
    // Keep external module types as plain imports in the emitted dts so
    // consumers reference the same class identities they get when importing
    // those modules directly. Bundling `ts-morph`'s `Project` into a vetra
    // chunk would otherwise produce `Project` vs `Project$1` clashes in
    // downstream code that mixes vetra/codegen helpers with raw ts-morph.
    neverBundle: [/^node:/, "ts-morph"],
  },
  clean: true,
  dts: true,
  sourcemap: true,
});
