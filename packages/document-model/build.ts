import { build } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

const dts = { generator: "tsgo", tsconfig: "tsconfig.dts.json" } as const;

await build({
  entry: ["index.ts", "mock.ts", "tooling.ts", "scalars.ts"],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts,
  plugins: [dtsExportList()],
  sourcemap: true,
});

await build({
  entry: ["node.mts"],
  outDir: "dist",
  platform: "node",
  clean: false,
  dts,
  plugins: [dtsExportList()],
  sourcemap: true,
});
