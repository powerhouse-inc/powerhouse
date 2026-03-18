import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    environment: "node",
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    include: ["test/**/*.test.ts"],
  },
});
