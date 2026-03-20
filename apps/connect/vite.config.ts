import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  define: {
    PH_PACKAGES: process.env.PH_PACKAGES
      ? JSON.stringify(process.env.PH_PACKAGES.split(",").filter(Boolean))
      : [],
    PH_PACKAGE_REGISTRY_URL: process.env.PH_CONNECT_PACKAGES_REGISTRY
      ? JSON.stringify(process.env.PH_CONNECT_PACKAGES_REGISTRY)
      : null,
  },
  envPrefix: ["PH_CONNECT_"],
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "@electric-sql/pglite-tools"],
  },
  plugins: [
    // process.env.PH_DEBUG_BUILD === "true" ? analyzer() : undefined,
    tsconfigPaths(),
    tailwind(),
    react(),
  ],
  worker: {
    format: "es",
  },
});
