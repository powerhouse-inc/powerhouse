import fs from "node:fs";
import path from "node:path";
import {
  Alias,
  AliasOptions,
  Plugin,
  PluginOption,
  ViteDevServer,
  normalizePath,
} from "vite";

export const LOCAL_DOCUMENT_MODELS_IMPORT = "LOCAL_DOCUMENT_MODELS";
export const LOCAL_DOCUMENT_PROCESSORS_IMPORT = "LOCAL_DOCUMENT_PROCESSORS";

export function getReactorConfig(env?: Record<string, string>): {
  [LOCAL_DOCUMENT_MODELS_IMPORT]?: string;
  [LOCAL_DOCUMENT_PROCESSORS_IMPORT]?: string;
} {
  const config: Record<string, string> = {};

  const LOCAL_DOCUMENT_MODELS =
    process.env.LOCAL_DOCUMENT_MODELS ??
    env?.LOCAL_DOCUMENT_MODELS ??
    process.cwd() + "/document-models";
  const LOCAL_DOCUMENT_PROCESSORS =
    process.env.LOCAL_DOCUMENT_PROCESSORS ??
    env?.LOCAL_DOCUMENT_PROCESSORS ??
    process.cwd() + "/processors";

  const LOCAL_DOCUMENT_MODELS_PATH = LOCAL_DOCUMENT_MODELS
    ? path.resolve(process.cwd(), LOCAL_DOCUMENT_MODELS)
    : undefined;
  const LOCAL_DOCUMENT_PROCESSORS_PATH = LOCAL_DOCUMENT_PROCESSORS
    ? path.resolve(process.cwd(), LOCAL_DOCUMENT_PROCESSORS)
    : undefined;

  if (LOCAL_DOCUMENT_MODELS_PATH) {
    config[LOCAL_DOCUMENT_MODELS_IMPORT] = normalizePath(
      LOCAL_DOCUMENT_MODELS_PATH
    );
  }
  if (LOCAL_DOCUMENT_PROCESSORS_PATH) {
    config[LOCAL_DOCUMENT_PROCESSORS_IMPORT] = normalizePath(
      LOCAL_DOCUMENT_PROCESSORS_PATH
    );
  }

  return config;
}

export function watchLocalFiles(
  server: ViteDevServer,
  documentModelsPath?: string,
  processorsPath?: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    console.log(`Local document models changed, reloading Reactor...`);
    server.ws.send({
      type: "full-reload",
      path: "*",
    });
  });

  const refreshProcessorsWithDebounce = debounce(() => {
    console.log(`Local document processors changed, reloading Reactor...`);
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
        }
      );
    } catch (e) {
      console.error("Error watching local document models", e);
    }
  }

  if (processorsPath) {
    console.log(`Watching local document processors at '${processorsPath}'...`);
    try {
      fs.watch(
        processorsPath,
        {
          recursive: true,
        },
        (event, filename) => {
          refreshProcessorsWithDebounce();
        }
      );
    } catch (e) {
      console.error("Error watching local document models", e);
    }
  }
}

// https://github.com/vitejs/vite/issues/6393#issuecomment-1006819717
// vite dev server doesn't support setting dependencies as external
// as when building the app.
function viteIgnoreStaticImport(importKeys: (string | RegExp)[]): Plugin {
  return {
    name: "vite-plugin-ignore-static-import",
    enforce: "pre",
    // vite will still append /@id/ to an external import
    // so this will rewrite the 'vite:import-analysis' prefix
    configResolved(resolvedConfig) {
      const values = importKeys.map((key) =>
        typeof key === "string" ? key : key.source
      );
      const reg = new RegExp(
        `("|')\\/@id\\/(${values.join("|")})(\\/[^"'\\\\]*)?\\1`,
        "g"
      );

      (resolvedConfig.plugins as Plugin[]).push({
        name: "vite-plugin-ignore-static-import-replace-idprefix",
        transform: (code) => {
          const matches = code.matchAll(reg);
          // @ts-ignore
          for (const match of matches) {
            code = code.replaceAll(match[0], match[0].replace("/@id/", ""));
          }
          return code;
        },
      });
    },
    // prevents the external import from being transformed to 'node_modules/...'
    resolveId: (id) => {
      if (
        importKeys.some((key) =>
          typeof key === "string" ? key === id : key.test(id)
        )
      ) {
        return { id, external: true };
      }
    },
    // returns empty string to prevent "Pre-transform error: Failed to load url"
    load(id) {
      if (
        importKeys.some((key) =>
          typeof key === "string" ? key === id : key.test(id)
        )
      ) {
        return "";
      }
    },
  };
}

export function viteReactorDevStudioPlugin(
  enabled = false,
  env?: Record<string, string>
): PluginOption[] {
  const reactorConfig = getReactorConfig(env);
  const localDocumentModelsPath = reactorConfig[LOCAL_DOCUMENT_MODELS_IMPORT];
  const localDocumentProcessorsPath =
    reactorConfig[LOCAL_DOCUMENT_PROCESSORS_IMPORT];

  return [
    enabled &&
      viteIgnoreStaticImport([
        "react",
        "react-dom",
        "@powerhousedao/scalars",
        "@powerhousedao/design-system",
      ]),
    {
      name: "vite-plugin-local-reactor-dev",
      enforce: "pre",
      config(config) {
        if (!localDocumentModelsPath && !localDocumentProcessorsPath) {
          return;
        }

        // adds the provided paths to be resolved by vite
        const resolve = config.resolve ?? {};
        const alias = resolve.alias;
        let resolvedAlias: AliasOptions | undefined;
        if (Array.isArray(alias)) {
          const arrayAlias = [...(alias as Alias[])];

          if (localDocumentModelsPath) {
            arrayAlias.push({
              find: LOCAL_DOCUMENT_MODELS_IMPORT,
              replacement: localDocumentModelsPath,
            });
          }

          if (localDocumentProcessorsPath) {
            arrayAlias.push({
              find: LOCAL_DOCUMENT_PROCESSORS_IMPORT,
              replacement: localDocumentProcessorsPath,
            });
          }
          resolvedAlias = arrayAlias;
        } else if (typeof alias === "object") {
          resolvedAlias = { ...alias, ...reactorConfig };
        } else if (typeof alias === "undefined") {
          resolvedAlias = { ...reactorConfig };
        } else {
          console.error("resolve.alias was not recognized");
        }

        if (resolvedAlias) {
          resolve.alias = resolvedAlias;
          config.resolve = resolve;
        }
      },
      configureServer(server) {
        watchLocalFiles(
          server,
          localDocumentModelsPath,
          localDocumentProcessorsPath
        );
      },
    },
  ];
}
