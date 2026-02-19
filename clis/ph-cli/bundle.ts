await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "./build",
  target: "node",
  define: { "process.env.CSS_TRANSFORMER_WASM": "false" },
});
