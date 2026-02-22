import { getConfig } from "@powerhousedao/config/node";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { join } from "node:path";
import { readPackageSync } from "read-pkg";
import {
  createLogger,
  loadEnv,
  type HtmlTagDescriptor,
  type PluginOption,
  type UserConfig,
} from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";
import {
  loadConnectEnv,
  normalizeBasePath,
  setConnectEnv,
  type ConnectEnv,
} from "./env-config.js";
import {
  resolveConnectPackageJson,
  stripVersionFromPackage,
} from "./helpers.js";
import type { IConnectOptions } from "./types.js";
import { phExternalPackagesPlugin } from "./vite-plugins/ph-external-packages.js";

export const connectClientConfig = {
  meta: [
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
  ],
} as const;

function viteOptionsToEnv(options: IConnectOptions) {
  const optionsEnv: Partial<ConnectEnv> = {};

  if (options.localPackage !== undefined) {
    if (options.localPackage === false) {
      optionsEnv.PH_DISABLE_LOCAL_PACKAGE = true;
    } else {
      optionsEnv.PH_LOCAL_PACKAGE = options.localPackage;
    }
  }

  return optionsEnv;
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

function resolveConnectVersion() {
  const connectPackageJson = resolveConnectPackageJson();
  return connectPackageJson && "version" in connectPackageJson
    ? (connectPackageJson.version as string)
    : null;
}

export function getConnectBaseViteConfig(options: IConnectOptions) {
  const mode = options.mode;
  const envDir = options.envDir ?? options.dirname;
  const fileEnv = loadEnv(mode, envDir, "PH_");

  // Map options to env vars
  const optionsEnv = viteOptionsToEnv(options);

  // Load and validate environment with priority: process.env > options > fileEnv > defaults
  const env = loadConnectEnv({
    processEnv: process.env,
    optionsEnv,
    fileEnv,
  });

  // if PH_CONNECT_VERSION is unknown, try to resolve it from the package.json
  if (env.PH_CONNECT_VERSION === "unknown") {
    const connectVersion = resolveConnectVersion();
    if (connectVersion) {
      env.PH_CONNECT_VERSION = connectVersion;
    }
  }

  // set the resolved env to process.env so it's loaded by vite
  setConnectEnv(env);

  // load package.json
  const packageJson = readPackageSync({ cwd: options.dirname });

  // load powerhouse config
  const phConfigPath =
    env.PH_CONFIG_PATH ?? join(options.dirname, "powerhouse.config.json");

  const phConfig = options.powerhouseConfig ?? getConfig(phConfigPath);

  // load packages from env variable
  const phPackagesStr = env.PH_PACKAGES || "";
  const envPhPackages = phPackagesStr.split(",");

  // loadPackages from config
  const configPhPackages =
    phConfig.packages?.map((p) =>
      typeof p === "string" ? p : p.packageName,
    ) ?? [];

  // merges env and config packages, remove empty strings, version suffixes and duplicates
  const allPackages = [
    ...new Set(
      [...envPhPackages, ...configPhPackages]
        .map(stripVersionFromPackage)
        .filter((p) => p.length),
    ),
  ];

  const localPackage = !env.PH_DISABLE_LOCAL_PACKAGE
    ? (env.PH_LOCAL_PACKAGE ?? options.dirname)
    : undefined;

  // remove duplicates and empty strings
  const phPackages = [...new Set(allPackages.filter((p) => p.trim().length))];

  const authToken = env.PH_SENTRY_AUTH_TOKEN;
  const org = env.PH_SENTRY_ORG;
  const project = env.PH_SENTRY_PROJECT;
  const release = env.PH_CONNECT_SENTRY_RELEASE || env.PH_CONNECT_VERSION;
  const uploadSentrySourcemaps = authToken && org && project;

  const plugins: PluginOption[] = [
    nodePolyfills({
      include: ["events"],
      globals: {
        Buffer: false,
        global: false,
        process: true,
      },
    }),
    tailwind(),
    svgr(),
    react(),
    phExternalPackagesPlugin(phPackages, localPackage),
    createHtmlPlugin({
      minify: false,
      inject: {
        tags: [
          ...(connectClientConfig.meta.map((meta) => ({
            ...meta,
            injectTo: "head",
          })) as HtmlTagDescriptor[]),
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

  const basePath = normalizeBasePath(env.PH_CONNECT_BASE_PATH || "/");

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

  const watchTimeout = options.watchTimeout ?? env.PH_WATCH_TIMEOUT;

  const config: UserConfig = {
    base: basePath,
    customLogger,
    envPrefix: ["PH_CONNECT_"],
    envDir: false,
    optimizeDeps: {
      exclude: [
        "@electric-sql/pglite",
        "@electric-sql/pglite-tools",
        "node_modules/.vite",
      ],
    },
    plugins,
    resolve: {
      alias: localPackage
        ? {
            [packageJson.name]: localPackage,
          }
        : undefined,
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@electric-sql/pglite",
      ],
    },
    build: {
      minify: true,
      sourcemap: true,
      rollupOptions: {
        treeshake: {
          moduleSideEffects: false,
        },
      },
    },
    server: {
      watch: env.PH_DISABLE_LOCAL_PACKAGE
        ? null
        : {
            ignored: [
              "**/.ph/**",
              "**/dist/**",
              "**/node_modules/**",
              "**/backup-documents/**",
            ],
            awaitWriteFinish: {
              stabilityThreshold: watchTimeout,
              pollInterval: 100,
            },
          },
      fs: {
        strict: false,
      },
      port: phConfig.studio?.port,
    },
    worker: {
      format: "es",
    },
  };
  return config;
}
