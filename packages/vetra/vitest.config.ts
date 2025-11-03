import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
      "document-models/**/*.test.ts",
      "editors/**/*.test.tsx",
      "processors/**/*.test.ts",
    ],
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./setupTests.ts"],
    passWithNoTests: true,
  },
  plugins: [react() as unknown as Plugin],
});
