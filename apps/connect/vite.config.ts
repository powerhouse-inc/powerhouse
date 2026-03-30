import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    PH_PACKAGE_REGISTRY_URL: process.env.PH_CONNECT_PACKAGES_REGISTRY
      ? JSON.stringify(process.env.PH_CONNECT_PACKAGES_REGISTRY)
      : null,
  },
  envPrefix: ["PH_CONNECT_"],
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "@electric-sql/pglite-tools"],
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
