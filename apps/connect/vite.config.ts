import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const dirname = import.meta.dirname;

  const baseConnectViteConfig = getConnectBaseViteConfig({
    mode,
    dirname,
    localPackage: false,
  });

  const additionalViteConfig: UserConfig = {
    // add your own vite config here
    plugins: [
      process.env.PH_DEBUG_BUILD === "true" ? analyzer() : undefined,
      tsconfigPaths(),
    ],
    build: {
      sourcemap: true,
      minify: true,
      rollupOptions: {
        // Externalize virtual paths only available in studio/dev mode
        // React is externalized so dynamically loaded CDN packages share
        // the same React instance via the import map in index.html
        external: ["/index.ts", "/style.css", /^react(-dom)?(\/.*)?$/],
      },
    },
    server: {
      watch: {},
    },
  };

  return mergeConfig(baseConnectViteConfig, additionalViteConfig);
});
