import { ts } from "@tmpl/core";

export const vitestConfigTemplate = ts`
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    globals: true,
  },
  plugins: [tsconfigPaths(), react()],
});

`;
