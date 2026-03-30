import type { PowerhouseConfig } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import { loadConnectEnv, setConnectEnv } from "@powerhousedao/shared/connect";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { join } from "node:path";
import {
  createLogger,
  esmExternalRequirePlugin,
  loadEnv,
  type HtmlTagDescriptor,
  type InlineConfig,
  type PluginOption,
} from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import type { IConnectOptions } from "./types.js";
import { phPackagesPlugin } from "./vite-plugins/ph-packages.js";

const isLocalDev = true;
const esmShUrl = isLocalDev ? "http://localhost:8080" : "https://esm.sh";

export function getConnectHtmlTags(
  options: {
    registryUrl?: string | null;
    injectTo?: HtmlTagDescriptor["injectTo"];
  } = {},
) {
  const { registryUrl, injectTo = "head" } = options;
  return [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh${registryUrl ? " " + registryUrl : ""}; object-src 'none'; base-uri 'self';`,
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        property: "og:title",
        content: "Connect",
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        property: "og:type",
        content: "website",
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        property: "og:url",
        content: "https://apps.powerhouse.io/powerhouse/connect/",
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        property: "og:description",
        content:
          "Navigate your organisation’s toughest operational challenges and steer your contributors to success with Connect. A navigation, collaboration and reporting tool for decentralised and open organisation.",
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        property: "og:image",
        content:
          "https://cf-ipfs.com/ipfs/bafkreigrmclndf2jpbolaq22535q2sw5t44uad3az3dpvkzrnt4lpjt63e",
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:card",
        content: "summary_large_image",
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:image",
        content:
          "https://cf-ipfs.com/ipfs/bafkreigrmclndf2jpbolaq22535q2sw5t44uad3az3dpvkzrnt4lpjt63e",
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:title",
        content: "Connect",
      },
      injectTo,
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:description",
        content:
          "Navigate your organisation’s toughest operational challenges and steer your contributors to success with Connect. A navigation, collaboration and reporting tool for decentralised and open organisation.",
      },
      injectTo,
    },
  ] as const satisfies HtmlTagDescriptor[];
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

  const connectHtmlTags = getConnectHtmlTags({
    registryUrl: phPackageRegistryUrl,
  });

  const plugins: PluginOption[] = [
    tailwind(),
    react(),
    createHtmlPlugin({
      minify: false,
      inject: {
        tags: [
          ...connectHtmlTags,
          {
            tag: "script",
            attrs: { type: "importmap" },
            children: JSON.stringify(
              {
                imports: {
                  react: "https://esm.sh/react@19.2.0",
                  "react/": "https://esm.sh/react@19.2.0/",
                  "react-dom": "https://esm.sh/react-dom@19.2.0",
                  "react-dom/": "https://esm.sh/react-dom@19.2.0/",
                },
              },
              null,
              2,
            ),
            injectTo: "head-prepend",
          },
        ],
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

  const reactExternal = [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react-dom/client",
  ];

  const config: InlineConfig = {
    configFile: false,
    mode,
    resolve: {
      tsconfigPaths: true,
    },
    define: {
      PH_PACKAGE_REGISTRY_URL: `"${phPackageRegistryUrl}"`,
    },
    customLogger,
    envPrefix: ["PH_CONNECT_"],
    optimizeDeps: {
      exclude: ["@electric-sql/pglite", "@electric-sql/pglite-tools"],
    },
    plugins: [
      ...plugins,
      // Externalize React so both Connect and dynamically loaded registry
      // packages share the same React instance via the import map in index.html.
      // Without this, Vite bundles React into Connect's chunks while registry
      // packages resolve React from the import map (esm.sh), creating two
      // separate React instances that don't share context/state.
      //
      // In Vite 8 (Rolldown), require() calls for external modules are preserved
      // as-is, which fails in browsers. esmExternalRequirePlugin handles both
      // externalization AND converting require() to import statements.
      // NOTE: Do NOT also list these in build.rolldownOptions.external — overlapping
      // entries prevent the plugin from transforming require() calls.
      esmExternalRequirePlugin({ external: reactExternal }),
      phPackagesPlugin({
        packages: phPackages,
      }),
    ],
    worker: {
      format: "es",
    },
    build: {
      sourcemap: true,
    },
  };
  return config;
}
