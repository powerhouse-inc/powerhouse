import { build } from "tsdown";

await build({
  entry: ["index.ts"],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: { tsconfig: "./tsconfig.dts.json" },
  sourcemap: true,
});

await build({
  entry: ["node.mts"],
  outDir: "dist",
  platform: "node",
  clean: false,
  dts: { tsconfig: "./tsconfig.dts.json" },
  sourcemap: true,
});
