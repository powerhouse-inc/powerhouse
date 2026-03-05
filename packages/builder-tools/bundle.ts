async function build() {
  const result = await Bun.build({
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

  if (result.success !== true) {
    console.error(result.logs);
    process.exit(1);
  }
}

await build().catch((error) => {
  console.error("Bun build failed:");
  console.error(error);
  process.exit(1);
});
