import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

// Dev only: the package manager loads external packages from the literal URLs
// `/node_modules/<pkg>/browser/index.js` and `/node_modules/<pkg>/style.css`,
// but published Powerhouse packages ship those files under `dist/`. When the
// literal path is missing and the dist one exists, rewrite the request so a
// locally installed package (e.g. `pnpm add <registry tarball>`) is served —
// Vite's transform pipeline then resolves the bundle's bare imports (react,
// document-model, viem, ...) against real node_modules, which the CDN route
// cannot do in dev.
function phLocalPackageDistRewrite(): Plugin {
  return {
    name: "ph-local-package-dist-rewrite",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [urlPath, query] = (req.url ?? "").split("?");
        // Package segment may carry a version spec ("name@dev") when the
        // request comes from a config entry with a version — the installed
        // directory never does, so the spec suffix is stripped.
        const match = urlPath.match(
          /^\/node_modules\/((?:@[^/]+\/)?[^/@]+)(?:@[^/]+)?\/(browser\/index\.js|style\.css)$/,
        );
        if (match) {
          const [, pkg, rest] = match;
          const base = path.join(server.config.root, "node_modules", pkg);
          if (
            !existsSync(path.join(base, rest)) &&
            existsSync(path.join(base, "dist", rest))
          ) {
            req.url = `/node_modules/${pkg}/dist/${rest}${query ? `?${query}` : ""}`;
          }
        }
        next();
      });
    },
  };
}

const version =
  process.env.WORKSPACE_VERSION ?? process.env.npm_package_version ?? "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA ?? "unknown";

export default defineConfig(({ command }) => ({
  resolve: {
    tsconfigPaths: true,
    // Dev only: resolve workspace packages through their `source` export
    // condition (see vitest.config.ts, which does the same) so edits under
    // packages/* are served straight from TypeScript with HMR, instead of
    // needing a `dist` rebuild per change. `vite build` keeps the default
    // `import` -> dist resolution so production output is unaffected.
    ...(command === "serve"
      ? {
          conditions: ["source", "import", "module", "browser", "default"],
        }
      : {}),
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
  plugins: [tailwind(), react(), phLocalPackageDistRewrite()],
  worker: {
    format: "es",
  },
}));
