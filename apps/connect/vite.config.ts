import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const dirname = import.meta.dirname;
  const env = loadEnv(mode, dirname);

  const config = getConnectBaseViteConfig({
    env,
    dirname,
  });

  return config;
});
