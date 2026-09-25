import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Building a full reactor per test can exceed the
    // default 5s testTimeout on CI runners, as in packages/reactor-api.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
