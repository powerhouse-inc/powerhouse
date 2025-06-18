import react from "@vitejs/plugin-react";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    exclude: [...defaultExclude, "test/__screenshots__/**"],
    globals: true,
    environment: "happy-dom",
    browser: {
      provider: "playwright",
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  define: {
    "process.env": {},
  },
});
