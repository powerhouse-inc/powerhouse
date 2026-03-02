await Bun.build({
  entrypoints: [
    "src/index.ts",
    "src/connect.ts",
    "src/analytics.ts",
    "src/analytics/hooks/index.ts",
  ],
  outdir: "dist",
  target: "browser",
  root: ".",
  external: [
    "@electric-sql/pglite",
    "@powerhousedao/analytics-engine-browser",
    "@powerhousedao/analytics-engine-core",
    "@powerhousedao/reactor",
    "react",
    "react-dom",
  ],
});
