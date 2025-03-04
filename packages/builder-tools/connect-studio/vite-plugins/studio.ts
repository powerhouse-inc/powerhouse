import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PluginOption, ViteDevServer } from "vite";
import {
  externalIds,
  getStudioConfig,
  HMR_MODULE_IMPORT,
  LOCAL_DOCUMENT_EDITORS_IMPORT,
  LOCAL_DOCUMENT_MODELS_IMPORT,
  STUDIO_IMPORTS,
  viteIgnoreStaticImport,
  viteReplaceImports,
} from "./base.js";
import { viteLoadHMRModule } from "./hmr.js";

export function watchLocalFiles(
  server: ViteDevServer,
  documentModelsPath?: string,
  editorsPath?: string,
) {
  const debounce = (callback: () => unknown, delay = 100) => {
    let timeout: NodeJS.Timeout | undefined;
    return function () {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        callback();
      }, delay);
    };
  };

  const refreshModelsWithDebounce = debounce(() => {
    console.log(`Local document models changed, reloading Connect...`);
    server.ws.send({
      type: "full-reload",
      path: "*",
    });
  });

  const refreshEditorsWithDebounce = debounce(() => {
    console.log(`Local document editors changed, reloading Connect...`);
    server.ws.send({
      type: "full-reload",
      path: "*",
    });
  });

  if (documentModelsPath) {
    // Use fs to watch the file and trigger a server reload when it changes
    console.log(`Watching local document models at '${documentModelsPath}'...`);
    try {
      fs.watch(
        documentModelsPath,
        {
          recursive: true,
        },
        (event, filename) => {
          refreshModelsWithDebounce();
        },
      );
    } catch (e) {
      console.error("Error watching local document models", e);
    }
  }

  if (editorsPath) {
    console.log(`Watching local document editors at '${editorsPath}'...`);
    try {
      fs.watch(
        editorsPath,
        {
          recursive: true,
        },
        (event, filename) => {
          refreshEditorsWithDebounce();
        },
      );
    } catch (e) {
      console.error("Error watching local document models", e);
    }
  }
}

export function viteConnectDevStudioPlugin(
  enabled = false,
  connectPath: string,
  env?: Record<string, string>,
): PluginOption[] {
  const studioConfig = getStudioConfig(env);
  const localDocumentModelsPath = studioConfig[LOCAL_DOCUMENT_MODELS_IMPORT];
  const localDocumentEditorsPath = studioConfig[LOCAL_DOCUMENT_EDITORS_IMPORT];

  return [
    enabled &&
      viteIgnoreStaticImport([
        "react",
        "react-dom",
        "@powerhousedao/reactor-browser",
      ]),
    localDocumentModelsPath
      ? viteReplaceImports({
          [LOCAL_DOCUMENT_MODELS_IMPORT]: localDocumentModelsPath,
        })
      : viteIgnoreStaticImport([LOCAL_DOCUMENT_MODELS_IMPORT]),
    localDocumentEditorsPath
      ? viteReplaceImports({
          [LOCAL_DOCUMENT_EDITORS_IMPORT]: localDocumentEditorsPath,
        })
      : viteIgnoreStaticImport([LOCAL_DOCUMENT_EDITORS_IMPORT]),
    enabled
      ? viteLoadHMRModule(connectPath)
      : viteIgnoreStaticImport([HMR_MODULE_IMPORT]),
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

        const buildStudioExternals = enabled
          ? [...externalIds, ...STUDIO_IMPORTS]
          : STUDIO_IMPORTS;

        config.build.rollupOptions.external.push(...buildStudioExternals);
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
      configureServer(server) {
        watchLocalFiles(
          server,
          localDocumentModelsPath,
          localDocumentEditorsPath,
        );
      },
    },
  ];
}
