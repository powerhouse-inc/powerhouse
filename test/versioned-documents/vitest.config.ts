import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
  plugins: [react()],
});
