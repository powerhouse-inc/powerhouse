import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import tsconfigPaths from "vite-tsconfig-paths";
import { nodePolyfills } from "vite-plugin-node-polyfills";

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
      nodePolyfills({ include: ["process"] }),
    ],
    server: {
      watch: {},
    },
  };

  return mergeConfig(baseConnectViteConfig, additionalViteConfig);
});
