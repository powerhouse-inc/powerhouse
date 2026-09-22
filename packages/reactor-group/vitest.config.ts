import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // No vi.mock and no global assignment in this suite, so test files can
    // share a module registry instead of re-instantiating it per file.
    isolate: false,
    include: ["test/**/*.test.ts", "document-models/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    globals: true,
  },
});
