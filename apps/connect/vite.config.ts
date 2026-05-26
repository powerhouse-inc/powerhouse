import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const version =
  process.env.WORKSPACE_VERSION ?? process.env.npm_package_version ?? "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA ?? "unknown";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    CONNECT_VERSION: JSON.stringify(version),
    CONNECT_GIT_SHA: JSON.stringify(gitSha),
    // Sentry release stays build-time so it always matches the sourcemap
    // upload tag the release workflow used.
    PH_CONNECT_SENTRY_RELEASE: JSON.stringify(version),
  },
  envPrefix: ["PH_CONNECT_"],
  optimizeDeps: {
    exclude: [
      "@electric-sql/pglite",
      "@electric-sql/pglite-tools",
      "pglite-legacy-02",
      "pglite-tools-legacy-02",
    ],
  },
  plugins: [tailwind(), react()],
  worker: {
    format: "es",
  },
});
