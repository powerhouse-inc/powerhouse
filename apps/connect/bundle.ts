await Bun.build({
  entrypoints: [
    "./src/main.tsx",
    "./src/components/index.ts",
    "./src/services/index.ts",
    "./src/connect.config.ts",
    "./src/context/index.ts",
    "./src/hooks/index.ts",
    "./src/i18n/index.ts",
    "./src/pages/index.ts",
    "./src/store/index.ts",
    "./src/utils/index.ts",
  ],
  outdir: "dist",
  target: "browser",
  root: ".",
  external: [
    "react",
    "react-dom",
    "@electric-sql/pglite",
    "@electric-sql/pglite-tools",
    "@powerhousedao/design-system",
    "@powerhousedao/builder-tools",
    // TODO: it should be possible to externalize this
    // but if we do, we get a `process` is not defined error.
    // it seems that there is something weird in the build pipeline.
    // "@powerhousedao/reactor-browser",
    "@powerhousedao/common",
    "@powerhousedao/config",
    "document-model",
    "document-drive",
    "vite",
  ],
});
