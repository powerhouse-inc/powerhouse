import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `tsconfigPaths()` resolves the `@powerhousedao/connect/*` path aliases
  // declared in tsconfig.json (e.g. `@powerhousedao/connect/services` ->
  // `./src/services/index.ts`), matching how the Vite build resolves them.
  plugins: [react(), tsconfigPaths()],
  resolve: {
    // Use the "source" export condition from package.json exports maps,
    // matching the project-wide tsconfig.options.json
    // `"customConditions": ["source"]` convention.
    //
    // This lets vitest resolve workspace packages (e.g.
    // @powerhousedao/reactor-browser) via their TypeScript source files
    // rather than requiring their `dist/` to exist first.
    conditions: ["source", "import", "module", "browser", "default"],
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    globals: true,
  },
});
