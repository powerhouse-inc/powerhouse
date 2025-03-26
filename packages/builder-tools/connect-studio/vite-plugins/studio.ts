import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type PluginOption } from "vite";
import { externalIds, viteIgnoreStaticImport } from "./base.js";

export function viteConnectDevStudioPlugin(
  enabled = false,
  connectPath: string,
  env?: Record<string, string>,
): PluginOption[] {
  return [
    enabled &&
      viteIgnoreStaticImport([
        "react",
        "react-dom",
        "@powerhousedao/reactor-browser",
        ...externalIds,
      ]),
    {
      name: "vite-plugin-connect-dev-studio",
      enforce: "pre",
      config(config) {
        if (!config.build) {
          config.build = {};
        }
        if (!config.build.rollupOptions) {
          config.build.rollupOptions = {};
        }
        if (!Array.isArray(config.build.rollupOptions.external)) {
          config.build.rollupOptions.external = [];
        }

        if (enabled) {
          config.build.rollupOptions.external.push(...externalIds);
        }
      },
      closeBundle() {
        if (!enabled) {
          fs.copyFileSync(
            fileURLToPath(import.meta.resolve("../hmr.js")),
            join(connectPath, "hmr.js"),
          );

          // Copy the .env file to the dist folder
          fs.copyFileSync(
            join(connectPath, "../.env"),
            join(connectPath, ".env"),
          );
        }
      },
    },
  ];
}
