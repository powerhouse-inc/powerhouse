import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
      "document-models/**/*.test.ts",
      "editors/**/*.test.tsx",
      "processors/**/*.test.ts",
      "subgraphs/**/*.test.ts",
    ],
    exclude: ["**/*.test.ts.bak", "**/node_modules/**", "**/dist/**"],
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./setupTests.ts"],
    passWithNoTests: true,
  },
  plugins: [react(), tsconfigPaths()],
});
