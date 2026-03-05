async function build() {
  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    root: ".",
    outdir: "./dist",
    target: "browser",
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
