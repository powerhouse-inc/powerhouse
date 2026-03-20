import { build } from "tsdown";

await build({
  entry: "index.ts",
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: true,
  sourcemap: true,
});

await build({
  entry: {
    "storage/filesystem": "./src/storage/filesystem.mts",
    "storage/prisma": "./src/storage/prisma/index.mts",
  },
  outDir: "dist",
  platform: "node",
  clean: false,
  dts: true,
  sourcemap: true,
});
