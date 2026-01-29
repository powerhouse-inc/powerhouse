await Bun.build({
  entrypoints: ["./src/cli.ts", "./src/cli.old.ts"],
  outdir: "./build",
  target: "node",
});
