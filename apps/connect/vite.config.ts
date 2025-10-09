import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const dirname = import.meta.dirname;

  const config = getConnectBaseViteConfig({
    mode,
    dirname,
    localPackage: false,
  });
  config.resolve!.conditions = [
    "source",
    "browser",
    "module",
    "jsnext:main",
    "jsnext",
  ];

  return config;
});
