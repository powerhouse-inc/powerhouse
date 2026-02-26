await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "dist",
  target: "node",
  root: ".",
  external: ["vite", "@powerhousedao/switchboard", "@powerhousedao/codegen"],
});
