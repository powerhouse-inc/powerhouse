async function build() {
  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "dist",
    root: ".",
    target: "browser",
    external: ["@electric-sql/pglite", "document-drive", "document-model"],
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
