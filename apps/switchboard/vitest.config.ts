import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    environment: "node",
    isolate: true,
    maxWorkers: 1,
    include: ["test/**/*.test.ts"],
  },
});
