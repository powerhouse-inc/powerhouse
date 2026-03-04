await Bun.build({
  entrypoints: ["./index.ts"],
  outdir: "dist",
  root: ".",
  target: "node",
  external: [
    "vite",
    "document-model",
    "vite-plugin-html",
    "vite-plugin-svgr",
    "@tailwindcss/vite",
    "@vitejs/plugin-basic-ssl",
    "@vitejs/plugin-react",
  ],
});
