console.log(process.env);

await Bun.build({
  entrypoints: [
    "./src/cli.ts",
    "./src/cli.old.ts",
    "./src/generate-commands-docs.ts",
  ],
  outdir: "./build",
  target: "node",
  define: {
    CLI_VERSION: `"${process.env.WORKSPACE_VERSION!}"`,
  },
});
