import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import packageJson from "./package.json" with { type: "json" };
import { join } from "node:path";

export default defineConfig({
  test: {
    globals: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      [packageJson.name]: join(import.meta.dirname),
    },
  },
});
