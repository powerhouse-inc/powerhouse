await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "dist",
  target: "node",
  root: ".",
  packages: "external",
});
