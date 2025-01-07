import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    environment: "node",
    env: loadEnv(mode, process.cwd(), ""),
    testTimeout: 5000,
    server: {
      deps: {
        inline: ["document-model-libs"],
      },
    },
    setupFiles: "./test/vitest-setup.ts",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
}));
