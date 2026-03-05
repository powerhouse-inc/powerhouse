import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@powerhousedao/reactor-browser/remote-controller": resolve(
        __dirname,
        "../../packages/reactor-browser/src/remote-controller/index.ts",
      ),
    },
  },
  test: {
    globalSetup: ["./global-setup.ts"],
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
