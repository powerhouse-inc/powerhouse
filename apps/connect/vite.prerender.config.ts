import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { bundledPackageVersions } from "./bundled-package-versions.ts";

// Bundles src/prerender/shell.tsx for Node; scripts/prerender-shell.ts runs it.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  resolve: { tsconfigPaths: true },
  define: {
    CONNECT_VERSION: JSON.stringify("prerender"),
    CONNECT_GIT_SHA: JSON.stringify("prerender"),
    PH_CONNECT_SENTRY_RELEASE: JSON.stringify("prerender"),
    PH_CONNECT_BUILD_HASH: JSON.stringify("prerender"),
    ...bundledPackageVersions,
  },
  ssr: { target: "node" },
  build: {
    ssr: "src/prerender/shell.tsx",
    outDir: ".prerender",
    emptyOutDir: true,
    target: "node24",
    rolldownOptions: {
      // Imported only as the reactor boots, which the shell never does.
      external: ["ph-bundled-packages-virtual"],
      output: { entryFileNames: "shell.js" },
    },
  },
});
