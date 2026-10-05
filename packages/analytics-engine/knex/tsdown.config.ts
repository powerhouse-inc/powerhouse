import { defineConfig } from "tsdown";
import { dtsExportList } from "../../../tsdown.dts.mjs";

export default defineConfig({
  entry: ["./index.ts"],
  outDir: "dist",
  platform: "browser",
  // Knex types come from the consumer's knex; its `export =` cannot be inlined.
  deps: { neverBundle: ["knex"] },
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
