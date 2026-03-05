async function build() {
  const result = await Bun.build({
    entrypoints: ["./src/cli.ts"],
    outdir: "dist",
    target: "node",
    root: ".",
    external: ["vite", "@powerhousedao/switchboard", "@powerhousedao/codegen"],
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
