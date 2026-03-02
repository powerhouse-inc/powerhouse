await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "dist",
  root: ".",
  target: "browser",
});
