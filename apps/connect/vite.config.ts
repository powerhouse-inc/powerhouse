import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  define: {
    PH_PACKAGES: [],
    PH_PACKAGE_REGISTRY_URL: null,
  },
  envPrefix: ["PH_CONNECT_"],
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "@electric-sql/pglite-tools"],
  },
  plugins: [
    process.env.PH_DEBUG_BUILD === "true" ? analyzer() : undefined,
    tsconfigPaths(),
    tailwind(),
    react(),
  ],
  worker: {
    format: "es",
  },
});
