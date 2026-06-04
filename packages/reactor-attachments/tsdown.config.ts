import { defineConfig } from "tsdown";

// Both entries build in ONE pass so shared modules (e.g. errors.ts) emit as one
// chunk -- separate builds inline a private error class per bundle, breaking
// instanceof across them.
export default defineConfig({
  entry: {
    index: "./index.ts",
    client: "./src/client.ts",
  },
  platform: "node",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  clean: true,
  dts: true,
  sourcemap: true,
});
