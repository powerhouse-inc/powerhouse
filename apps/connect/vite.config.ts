import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { defineConfig, mergeConfig, type UserConfig } from "vite";

export default defineConfig(({ mode }) => {
  const dirname = import.meta.dirname;

  const baseConnectViteConfig = getConnectBaseViteConfig({
    mode,
    dirname,
    localPackage: false,
  });

  const additionalViteConfig: UserConfig = {
    // add your own vite config here
    resolve: {
      conditions: ["source", "browser", "module", "jsnext:main", "jsnext"],
    },
  };

  return mergeConfig(baseConnectViteConfig, additionalViteConfig);
});
