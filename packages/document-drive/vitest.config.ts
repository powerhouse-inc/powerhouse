import { loadEnv } from "vite";
import { defaultExclude, defineConfig } from "vitest/config";

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
        isolate: true,
      },
    },
    include: ["test/**/*.test.ts"],
    exclude: [...defaultExclude, "test/flaky/**", "test/test-storage/**"],
    alias: {
      "#": new URL("./src/", import.meta.url).pathname,
    },
  },
}));
