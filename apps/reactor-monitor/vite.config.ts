import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  resolve: {
    // Dev only: resolve workspace packages (e.g. @powerhousedao/reactor-monitor)
    // through their `source` export condition, matching apps/connect's
    // vite.config.ts, so edits under packages/* are served straight from
    // TypeScript with HMR instead of needing a `dist` rebuild per change.
    // `vite build` keeps the default `import` -> dist resolution.
    ...(command === "serve"
      ? {
          conditions: ["source", "import", "module", "browser", "default"],
        }
      : {}),
  },
  plugins: [react()],
  worker: {
    format: "es",
  },
}));
