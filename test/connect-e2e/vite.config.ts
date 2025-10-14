import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { defineConfig, mergeConfig, type UserConfig } from "vite";

export default defineConfig(({ mode }) => {
  const baseConnectViteConfig = getConnectBaseViteConfig({
    mode,
    dirname: import.meta.dirname,
  });

  const additionalViteConfig: UserConfig = {
    // add your own vite config here
    resolve: {
      conditions: ["source", "browser", "module", "jsnext:main", "jsnext"],
    },
  };

  return mergeConfig(baseConnectViteConfig, additionalViteConfig);
});
