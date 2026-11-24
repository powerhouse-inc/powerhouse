import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { cssText } from "./css-text.mjs";

const conditions = ["source", "import", "module", "browser", "default"];

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react(), cssText({ optional: true })],
        resolve: { conditions },
        ssr: { resolve: { conditions } },
        test: {
          name: "ui",
          include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
          exclude: ["test/**/*.node.test.ts"],
          setupFiles: ["test/setup.ts"],
          globals: true,
        },
      },
      {
        // Reads real projects with the packages the dev server loads: their
        // builds, as a project has them.
        test: {
          name: "node",
          include: ["test/**/*.node.test.ts"],
          // A file's first test pays for loading ts-morph and the definition
          // tooling.
          testTimeout: 20_000,
        },
      },
    ],
  },
});
