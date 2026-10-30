import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { bundledPackageVersions } from "./bundled-package-versions.ts";

export default defineConfig({
  // `tsconfigPaths()` resolves the `@powerhousedao/connect/*` path aliases
  // declared in tsconfig.json (e.g. `@powerhousedao/connect/services` ->
  // `./src/services/index.ts`), matching how the Vite build resolves them.
  plugins: [react(), tsconfigPaths()],
  define: bundledPackageVersions,
  resolve: {
    // Use the "source" export condition from package.json exports maps,
    // matching the project-wide tsconfig.options.json
    // `"customConditions": ["source"]` convention.
    //
    // This lets vitest resolve workspace packages (e.g.
    // @powerhousedao/reactor-browser) via their TypeScript source files
    // rather than requiring their `dist/` to exist first.
    conditions: ["source", "import", "module", "browser", "default"],
    // The node pool resolves through ssr, which ignores `conditions` above, so
    // connect-core's own import of the router would load its dist. Point it at
    // the source. (A global ssr "source" condition also reaches third-party
    // packages that ship TypeScript source, which node cannot load.)
    alias: [
      {
        find: /^@powerhousedao\/reactor-router$/,
        replacement: fileURLToPath(
          new URL(
            "../../packages/reactor-router/src/index.ts",
            import.meta.url,
          ),
        ),
      },
    ],
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    globals: true,
    testTimeout: 15_000,
  },
});
