import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(({ mode }) => {
  const baseConnectViteConfig = getConnectBaseViteConfig({
    mode,
    dirname: import.meta.dirname,
  });

  const additionalViteConfig: UserConfig = {
    plugins: [nodePolyfills({ include: ["process"] })],
  };

  const config = mergeConfig(baseConnectViteConfig, additionalViteConfig);

  return config;
});
