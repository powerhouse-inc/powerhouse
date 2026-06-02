import type { PowerhouseConfig } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import { loadConnectEnv, setConnectEnv } from "@powerhousedao/shared/connect";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import {
  createLogger,
  esmExternalRequirePlugin,
  loadEnv,
  searchForWorkspaceRoot,
  type HtmlTagDescriptor,
  type InlineConfig,
  type PluginOption,
} from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import type { IConnectOptions } from "./types.js";
import { devReactImportmapPlugin } from "./vite-plugins/dev-external-react.js";
import { connectFaviconPlugin } from "./vite-plugins/favicon.js";
import { phBundledPackagesPlugin } from "./vite-plugins/ph-bundled-packages.js";
import { phPackagesPlugin } from "./vite-plugins/ph-packages.js";

const REACT_VERSION = "19.2.0";

// Importmap injected into Connect's HTML in production builds. The build
// pipeline externalizes react/react-dom via Rolldown's
// `esmExternalRequirePlugin` (see below), so the browser resolves bare
// `react` imports through this map → CDN editor packages and Connect share
// the same React instance via esm.sh. In dev, `devReactImportmapPlugin`
// rewrites this map to point at Vite's pre-bundled React instead.
const REACT_IMPORTMAP_IMPORTS: Record<string, string> = {
  react: `https://esm.sh/react@${REACT_VERSION}`,
  "react/": `https://esm.sh/react@${REACT_VERSION}/`,
  "react-dom": `https://esm.sh/react-dom@${REACT_VERSION}`,
  "react-dom/": `https://esm.sh/react-dom@${REACT_VERSION}/`,
};

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
        content: `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh${registryUrl ? " " + registryUrl : ""}; worker-src 'self' blob:; object-src 'none'; base-uri 'self';`,
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
  // Preserve the version/tag from powerhouse.config.json so Connect's runtime
  // resolver sees it when building the registry CDN URL. Without this the
  // registry falls back to its `latest` dist-tag, which may point to a
  // different release stream than what the project asked for (e.g. latest
  // vs. dev). Local packages resolve from node_modules and don't need a
  // version here.
  return packages.map((p) =>
    p.version && p.provider !== "local"
      ? `${p.packageName}@${p.version}`
      : p.packageName,
  );
}

function getLocalPackageNamesFromPowerhouseConfig({
  packages,
}: PowerhouseConfig) {
  if (!packages) return [];
  return packages
    .filter((p) => p.provider === "local")
    .map((p) => p.packageName);
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
  const localPackagesFromConfig =
    getLocalPackageNamesFromPowerhouseConfig(phConfig);
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
              { imports: REACT_IMPORTMAP_IMPORTS },
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
      import("@sentry/vite-plugin").then(({ sentryVitePlugin }) =>
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
        }),
      ) as PluginOption,
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

  // pnpm `link:` deps (e.g. a downstream project linking @powerhousedao/*
  // packages from a sibling monorepo checkout) live outside Vite's
  // auto-detected workspace root. Their `node_modules/.pnpm/...` assets
  // then 403 through `/@fs/`, returning a 760-byte HTML body where the
  // binary should be — which breaks PGlite at startup with "Invalid FS
  // bundle size: 760 !== 4939170". Resolve key linked packages back to
  // their real workspace roots and allow Vite to serve from there.
  const linkedRoots = [
    "@powerhousedao/reactor-browser",
    "@powerhousedao/connect",
    "@electric-sql/pglite",
  ]
    .map((pkg) => {
      try {
        return searchForWorkspaceRoot(
          realpathSync(join(options.dirname, "node_modules", pkg)),
        );
      } catch {
        return null;
      }
    })
    .filter((p): p is string => p !== null);

  const config: InlineConfig = {
    configFile: false,
    mode,
    // Prefix served/built asset URLs so Connect can run under a path prefix
    // (reverse proxy). Mirrors the client router basename.
    base: env.PH_CONNECT_BASE_PATH,
    server: {
      watch: {
        ignored: ["**/backup-documents/**", "**/.ph/**"],
      },
      fs: {
        allow: [searchForWorkspaceRoot(options.dirname), ...linkedRoots],
      },
    },
    resolve: {
      dedupe: ["react", "react-dom"],
      tsconfigPaths: true,
    },
    define: {},
    customLogger,
    envPrefix: ["PH_CONNECT_"],
    optimizeDeps: {
      include: [
        "document-model",
        "zod",
        "@powerhousedao/design-system/connect",
        "@powerhousedao/reactor-browser",
        "@powerhousedao/document-engineering",
      ],
      exclude: ["@electric-sql/pglite", "@electric-sql/pglite-tools"],
    },
    plugins: [
      // phPackagesPlugin must be registered before tailwind so its hotUpdate
      // hook runs first and can suppress HMR updates for codegen-generated
      // files, preventing tailwind from triggering full page reloads.
      phPackagesPlugin({
        packages: phPackages,
        projectRoot: options.dirname,
        registryUrl: phPackageRegistryUrl,
      }),
      phBundledPackagesPlugin({
        packages: localPackagesFromConfig,
        projectRoot: options.dirname,
      }),
      // Dev-only: rewrite the importmap so it points at Vite's pre-bundled
      // React (the same URL Connect's own modules resolve to). Without this,
      // CDN editors load React from esm.sh while Connect uses Vite's local
      // copy → two React instances → useSyncExternalStore crash. The build
      // path stays untouched; `esmExternalRequirePlugin` below still owns it.
      devReactImportmapPlugin(),
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
      connectFaviconPlugin(),
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
