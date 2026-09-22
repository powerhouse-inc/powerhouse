import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No vi.mock and no global assignment in this suite, so test files can
    // share a module registry instead of re-instantiating it per file.
    isolate: false,
    include: ["src/**/__tests__/**/*.test.ts"],
    passWithNoTests: true,
  },
});
