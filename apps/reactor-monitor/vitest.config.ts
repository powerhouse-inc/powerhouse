import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    // Use the "source" export condition from package.json exports maps,
    // matching apps/connect/vitest.config.ts and the project-wide
    // tsconfig.options.json `"customConditions": ["source"]` convention, so
    // vitest resolves @powerhousedao/reactor-monitor via its TypeScript
    // source rather than requiring `dist/` to exist first.
    conditions: ["source", "import", "module", "browser", "default"],
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
  },
});
