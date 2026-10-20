import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Workspace packages resolve to their TypeScript source, as in Connect.
const conditions = ["source", "import", "module", "browser", "default"];

export default defineConfig({
  plugins: [react()],
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    globals: true,
    // Tests that stand up a reactor boot PGlite first.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
