import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: [
    "./index.ts",
    "./src/ai/index.ts",
    "./src/graphql-client/entry.ts",
    "./src/analytics/index.ts",
    "./src/document-model.ts",
    "./src/graphql/client.ts",
    "./src/relational/index.ts",
    "./src/renown/index.ts",
    "./src/rpc/index.ts",
  ],
  platform: "browser",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
