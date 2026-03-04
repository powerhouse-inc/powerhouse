await Bun.build({
  entrypoints: ["./src/index.ts", "./src/connect.ts", "./src/analytics.ts"],
  outdir: "dist",
  root: ".",
  target: "browser",
  external: [
    "react",
    "react-dom",
    "@electric-sql/pglite",
    "document-drive",
    "document-model",
    "vite",
    "@powerhousedao/reactor",
  ],
});
