import { rmSync } from "node:fs";
import { defineConfig } from "tsup";

// cleans dist folder
rmSync("dist", { recursive: true, force: true });

export default defineConfig([
  {
    entry: ["src/**/*.ts"],
    splitting: false,
    sourcemap: true,
    clean: false,
    format: "esm",
    treeshake: true,
    bundle: false,
    platform: "node",
    target: "node20",
    cjsInterop: true,
  },
]);
