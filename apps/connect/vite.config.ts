import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadRuntimeEnvWithExplicit } from "@powerhousedao/shared/connect";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";

const { explicit: explicitRuntimeEnv } = loadRuntimeEnvWithExplicit({
  processEnv: process.env,
});

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: {
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
