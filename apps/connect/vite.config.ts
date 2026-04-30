import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadRuntimeEnvWithExplicit } from "@powerhousedao/shared/connect";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";

const version =
  process.env.WORKSPACE_VERSION ?? process.env.npm_package_version ?? "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA ?? "unknown";

const { explicit: explicitRuntimeEnv } = loadRuntimeEnvWithExplicit({
  processEnv: process.env,
});

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    CONNECT_VERSION: JSON.stringify(version),
    CONNECT_GIT_SHA: JSON.stringify(gitSha),
    PH_PACKAGE_REGISTRY_URL: process.env.PH_CONNECT_PACKAGES_REGISTRY
      ? JSON.stringify(process.env.PH_CONNECT_PACKAGES_REGISTRY)
      : null,
    PH_CONNECT_EXPLICIT_ENV: JSON.stringify(explicitRuntimeEnv),
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
  plugins: [
    process.env.PH_DEBUG_BUILD === "true" ? analyzer() : undefined,
    tailwind(),
    react(),
  ],
  worker: {
    format: "es",
  },
});
