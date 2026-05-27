import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
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
