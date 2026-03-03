await Bun.build({
  entrypoints: ["./src/index.ts"],
  root: ".",
  outdir: "./dist",
  target: "browser",
  external: ["react", "react-dom", "@electric-sql/pglite"],
});
