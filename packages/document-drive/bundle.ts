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
    "cache/redis": "./src/cache/redis.mts",
    "storage/filesystem": "./src/storage/filesystem.mts",
    "storage/prisma/index": "./src/storage/prisma/index.mts",
  },
  outDir: "dist",
  platform: "node",
  clean: false,
  dts: true,
  sourcemap: true,
});
