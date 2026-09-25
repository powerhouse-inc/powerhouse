import { build } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

await build({
  entry: ["index.ts", "mock.ts"],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});

await build({
  entry: ["node.mts"],
  outDir: "dist",
  platform: "node",
  clean: false,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
