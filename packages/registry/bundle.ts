await Bun.build({
  entrypoints: ["./src/index.ts", "./src/cli.ts"],
  outdir: "dist",
  root: ".",
  target: "node",
});
