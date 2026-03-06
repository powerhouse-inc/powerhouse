import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts", "src/generate-commands-docs.ts"],
  outDir: "dist",
  clean: true,
  dts: { build: true },
  sourcemap: true,
  define: {
    CLI_VERSION: `"${process.env.WORKSPACE_VERSION || process.env.npm_package_version!}"`,
  },
});
