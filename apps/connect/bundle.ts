await Bun.build({
  entrypoints: ["./src/main.tsx"],
  outdir: "build",
  target: "browser",
  root: ".",
  external: [
    "@electric-sql/pglite",
    "@electric-sql/pglite-tools",
    "@powerhousedao/analytics-engine-browser",
  ],
});
