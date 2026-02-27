import { cp } from "node:fs/promises";

await Bun.build({
  entrypoints: ["./src/index.ts", "./src/cli.ts"],
  outdir: "dist",
  root: ".",
  target: "node",
});

await cp("./storage/", "./dist/storage", { recursive: true, force: true });
await cp("./cdn-cache/", "./dist/cdn-cache", { recursive: true, force: true });
await cp("./packages/", "./dist/packages", { recursive: true, force: true });
