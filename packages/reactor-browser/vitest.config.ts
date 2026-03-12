import react from "@vitejs/plugin-react";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: "browser",
          include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
          exclude: [
            ...defaultExclude,
            "test/__screenshots__/**",
            "test/**/*.node.test.ts",
          ],
          globals: true,
          environment: "happy-dom",
          browser: {
            provider: "playwright",
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
        optimizeDeps: {
          exclude: ["@electric-sql/pglite"],
        },
        define: {
          "process.env": {},
        },
      },
      {
        test: {
          name: "node",
          include: ["test/**/*.node.test.ts"],
          globals: true,
          environment: "node",
        },
      },
    ],
  },
});
