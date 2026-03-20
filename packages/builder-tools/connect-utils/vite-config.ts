import type { PowerhouseConfig } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import { loadConnectEnv, setConnectEnv } from "@powerhousedao/shared/connect";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { join } from "node:path";
import {
  createLogger,
  loadEnv,
  type InlineConfig,
  type PluginOption,
} from "vite";
import { viteImportMaps } from "vite-import-maps";
import { createHtmlPlugin } from "vite-plugin-html";
import tsconfigPaths from "vite-tsconfig-paths";
import type { IConnectOptions } from "./types.js";

/**
 * Vite plugin that fixes vite-import-maps shared chunks for CJS packages.
 * `export * from "react"` doesn't re-export named exports from CJS modules,
 * so we intercept the virtual chunk and provide explicit named re-exports.
 */
function cjsNamedExportsPlugin(): PluginOption {
  const VIRTUAL_PREFIX = "\0virtual:import-map-chunk";
  const CJS_REEXPORTS: Record<string, string> = {
    react: `export { Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense, cloneElement, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo, startTransition, use, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition, version } from "react";\nexport { default } from "react";`,
    "react-dom": `export { createPortal, flushSync, findDOMNode, hydrate, render, unmountComponentAtNode, version } from "react-dom";\nexport { default } from "react-dom";`,
    "react_jsx-runtime": `export { jsx, jsxs, Fragment } from "react/jsx-runtime";\nexport { default } from "react/jsx-runtime";`,
    "react-dom_client": `export { createRoot, hydrateRoot } from "react-dom/client";\nexport { default } from "react-dom/client";`,
  };

  return {
    name: "cjs-named-exports-fix",
    enforce: "pre",
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return;
      const chunkName = id.slice(VIRTUAL_PREFIX.length + 1);
      if (chunkName in CJS_REEXPORTS) {
        return {
          code: CJS_REEXPORTS[chunkName],
          moduleSideEffects: "no-treeshake",
        };
      }
    },
  };
}

export function getConnectMetaTags(registryUrl: string | null = null) {
  return [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${registryUrl || ""} ; object-src 'none'; base-uri 'self';`,
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:title",
        content: "Connect",
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:type",
        content: "website",
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:url",
        content: "https://apps.powerhouse.io/powerhouse/connect/",
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:description",
        content:
          "Navigate your organisation’s toughest operational challenges and steer your contributors to success with Connect. A navigation, collaboration and reporting tool for decentralised and open organisation.",
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:image",
        content:
          "https://cf-ipfs.com/ipfs/bafkreigrmclndf2jpbolaq22535q2sw5t44uad3az3dpvkzrnt4lpjt63e",
      },
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:card",
        content: "summary_large_image",
      },
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:image",
        content:
          "https://cf-ipfs.com/ipfs/bafkreigrmclndf2jpbolaq22535q2sw5t44uad3az3dpvkzrnt4lpjt63e",
      },
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:title",
        content: "Connect",
      },
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:description",
        content:
          "Navigate your organisation’s toughest operational challenges and steer your contributors to success with Connect. A navigation, collaboration and reporting tool for decentralised and open organisation.",
      },
    },
  ] as const;
}

function viteLogger({
  silence,
}: {
  silence?: { warnings?: string[]; errors?: string[] };
}) {
  const logger = createLogger();
  const loggerWarn = logger.warn.bind(logger);
  const loggerError = logger.error.bind(logger);

  logger.warn = (msg, options) => {
    if (silence?.warnings?.some((warning) => msg.includes(warning))) {
      return;
    }
    loggerWarn(msg, options);
  };

  logger.error = (msg, options) => {
    if (silence?.errors?.some((error) => msg.includes(error))) {
      return;
    }
    loggerError(msg, options);
  };

  return logger;
}

function getPackageNamesFromPowerhouseConfig({ packages }: PowerhouseConfig) {
  if (!packages) return [];
  return packages.map((p) => p.packageName);
}

export function getConnectBaseViteConfig(options: IConnectOptions) {
  const mode = options.mode;
  const envDir = options.envDir ?? options.dirname;
  const fileEnv = loadEnv(mode, envDir, "PH_");

  // Load and validate environment with priority: process.env > options > fileEnv > defaults
  const env = loadConnectEnv({
    processEnv: process.env,
    fileEnv,
  });

  // set the resolved env to process.env so it's loaded by vite
  setConnectEnv(env);

  // load powerhouse config
  const phConfigPath =
    env.PH_CONFIG_PATH ?? join(options.dirname, "powerhouse.config.json");

  const phConfig = options.powerhouseConfig ?? getConfig(phConfigPath);

  const packagesFromConfig = getPackageNamesFromPowerhouseConfig(phConfig);
  const phPackagesStr = env.PH_PACKAGES;
  const envPhPackages = phPackagesStr?.split(",");

  const phPackages = envPhPackages ?? packagesFromConfig;

  const phPackageRegistryUrl =
    env.PH_CONNECT_PACKAGES_REGISTRY ?? phConfig.packageRegistryUrl ?? null;

  const authToken = env.PH_SENTRY_AUTH_TOKEN;
  const org = env.PH_SENTRY_ORG;
  const project = env.PH_SENTRY_PROJECT;
  const release = env.PH_CONNECT_SENTRY_RELEASE || env.PH_CONNECT_VERSION;
  const uploadSentrySourcemaps = authToken && org && project;

  // Curated list of shared dependencies exposed via import map so that
  // dynamically loaded registry packages resolve them from the host.
  // Only packages actually imported at runtime in the browser belong here.
  // Packages with only subpath exports (e.g. @powerhousedao/shared) need
  // each subpath listed explicitly using the { name, entry } form.
  const sharedImports: Array<string | { name: string; entry: string }> = [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react-dom/client",
    "document-model",
    "document-drive",
    "@powerhousedao/common",
    {
      name: "@powerhousedao/common/utils",
      entry: "@powerhousedao/common/utils",
    },
    "@powerhousedao/design-system",
    {
      name: "@powerhousedao/design-system/connect",
      entry: "@powerhousedao/design-system/connect",
    },
    "@powerhousedao/reactor-browser",
    {
      name: "@powerhousedao/shared/processors",
      entry: "@powerhousedao/shared/processors",
    },
    {
      name: "@powerhousedao/shared/document-model",
      entry: "@powerhousedao/shared/document-model",
    },
    {
      name: "@powerhousedao/shared/document-drive",
      entry: "@powerhousedao/shared/document-drive",
    },
    {
      name: "@powerhousedao/shared/connect",
      entry: "@powerhousedao/shared/connect",
    },
    {
      name: "@powerhousedao/shared/registry",
      entry: "@powerhousedao/shared/registry",
    },
    {
      name: "@powerhousedao/shared/constants",
      entry: "@powerhousedao/shared/constants",
    },
  ];

  const plugins: PluginOption[] = [
    cjsNamedExportsPlugin(),
    tsconfigPaths(),
    tailwind(),
    react(),
    viteImportMaps({
      imports: sharedImports,
      modulesOutDir: "shared",
      importMapHtmlTransformer(importMap) {
        if (!importMap.imports) return importMap;
        const imports = Object.fromEntries(
          Object.entries(importMap.imports).map(
            ([key, value]: [string, string]) => [
              key,
              value.startsWith("./") ? value.slice(1) : value,
            ],
          ),
        );
        return { ...importMap, imports };
      },
    }),
    createHtmlPlugin({
      minify: false,
      inject: {
        tags: getConnectMetaTags(phPackageRegistryUrl).map((meta) => ({
          ...meta,
          injectTo: "head",
        })),
      },
    }),
  ] as const;

  if (uploadSentrySourcemaps) {
    plugins.push(
      sentryVitePlugin({
        release: {
          name: release ?? "unknown",
          inject: false, // prevent it from injecting the release id in the service worker code, this is done in 'src/app/sentry.ts' instead
        },
        authToken,
        org,
        project,
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
        },
        reactComponentAnnotation: {
          enabled: true,
        },
      }) as PluginOption,
    );
  }

  // hide warnings unless LOG_LEVEL is set to debug
  const isDebug =
    process.env.LOG_LEVEL === "debug" || env.PH_CONNECT_LOG_LEVEL === "debug";
  const customLogger = isDebug
    ? undefined
    : viteLogger({
        silence: {
          warnings: [
            "@import must precede all other statements (besides @charset or empty @layer)", // tailwindcss error when importing font file
          ],
          errors: ["Unterminated string literal"],
        },
      });

  const config: InlineConfig = {
    configFile: false,
    mode,
    define: {
      PH_PACKAGES: phPackages,
      PH_PACKAGE_REGISTRY_URL: `"${phPackageRegistryUrl}"`,
    },
    customLogger,
    envPrefix: ["PH_CONNECT_"],
    optimizeDeps: {
      exclude: ["@electric-sql/pglite", "@electric-sql/pglite-tools"],
    },
    plugins,
    worker: {
      format: "es",
    },
  };
  return config;
}
