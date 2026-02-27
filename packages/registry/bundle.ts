await Bun.build({
  entrypoints: ["./src/index.ts", "./src/run.ts"],
  outdir: "dist",
  root: ".",
  target: "node",
});
