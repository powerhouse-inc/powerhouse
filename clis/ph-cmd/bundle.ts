async function build() {
  const result = await Bun.build({
    entrypoints: [
      "./src/cli.ts",
      "./src/cli.old.ts",
      "./src/generate-commands-docs.ts",
    ],
    outdir: "./build",
    target: "node",
    define: {
      CLI_VERSION: `"${process.env.WORKSPACE_VERSION || process.env.npm_package_version!}"`,
    },
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
