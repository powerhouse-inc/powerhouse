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
    resolve: {
      conditions: ["source", "browser", "module", "jsnext:main", "jsnext"],
    },
    build: {
      sourcemap: true,
      minify: true,
    },
    server: {
      watch: {},
    },
  };

  return mergeConfig(baseConnectViteConfig, additionalViteConfig);
});
