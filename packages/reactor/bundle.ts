await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "dist",
  root: ".",
  target: "browser",
  external: ["@electric-sql/pglite", "document-drive", "document-model"],
});
