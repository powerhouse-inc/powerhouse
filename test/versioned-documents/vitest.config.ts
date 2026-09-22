import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    // No vi.mock and no global assignment in this suite, so test files can
    // share a module registry instead of re-instantiating it per file.
    isolate: false,
    globals: true,
  },
  plugins: [tsconfigPaths(), react()],
});
