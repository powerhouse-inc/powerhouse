import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./index.ts",
    "./src/analytics/index.ts",
    "./src/document-model.ts",
    "./src/graphql/client.ts",
    "./src/relational/index.ts",
    "./src/renown/index.ts",
    "./src/rpc/index.ts",
  ],
  platform: "browser",
  clean: true,
  dts: true,
  sourcemap: true,
});
