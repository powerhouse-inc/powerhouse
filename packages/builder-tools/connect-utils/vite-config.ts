import type { PowerhouseConfig } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import {
  deepMerge,
  loadConnectEnv,
  mergePwaConfig,
  normalizeBasePath,
  setConnectEnv,
} from "@powerhousedao/shared/connect";
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
import {
  DYNAMIC_BASE_PLACEHOLDER,
  connectDynamicBasePlugin,
} from "./vite-plugins/dynamic-base.js";
import { connectFaviconPlugin } from "./vite-plugins/favicon.js";
import { phBundledPackagesPlugin } from "./vite-plugins/ph-bundled-packages.js";
import { phConfigPlugin } from "./vite-plugins/ph-config.js";
import {
  collectPackagePwaContributions,
  collectProjectPwaContribution,
  validateProjectPwaConfig,
} from "./vite-plugins/pwa-packages.js";
import { connectPwaPlugins } from "./vite-plugins/pwa.js";
import { reactSelfHostPlugin } from "./vite-plugins/react-self-host.js";

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
        content: `script-src 'self' 'unsafe-inline' 'unsafe-eval'${registryUrl ? " " + registryUrl : ""}; worker-src 'self' blob:; object-src 'none'; base-uri 'self';`,
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

function parsePackagesEnvOverride(phPackagesStr: string) {
  return phPackagesStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const lastAt = entry.lastIndexOf("@");
      if (lastAt > 0) {
        return {
          packageName: entry.slice(0, lastAt),
          version: entry.slice(lastAt + 1),
          provider: "registry" as const,
        };
      }
      return { packageName: entry, provider: "registry" as const };
    });
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

  // Load and validate environment with priority: process.env > fileEnv > defaults
  const env = loadConnectEnv({
    processEnv: process.env,
    fileEnv,
  });

  // set the resolved env to process.env so it's loaded by vite
  setConnectEnv(env);

  // Source config is always the project-root powerhouse.config.json.
  const phConfigPath = join(options.dirname, "powerhouse.config.json");

  const phConfig = options.powerhouseConfig ?? getConfig(phConfigPath);

  const packagesFromConfig = phConfig.packages ?? [];
  const localPackagesFromConfig =
    getLocalPackageNamesFromPowerhouseConfig(phConfig);
  const phPackagesStr = env.PH_PACKAGES;
  const envPhPackages = phPackagesStr
    ? parsePackagesEnvOverride(phPackagesStr)
    : undefined;

  const phPackages = envPhPackages ?? packagesFromConfig;

  // Precedence (highest → lowest): `ph connect build --packages-registry`
  // CLI override > source-config `packageRegistryUrl`. The resolved value
  // flows both into the CSP header (script-src allowance for the registry
  // CDN) and into the emitted runtime config so the SPA reads the same
  // value.
  const phPackageRegistryUrl =
    options.cliPackageRegistryUrl ?? phConfig.packageRegistryUrl ?? null;

  // Base path is a runtime-config field (connect.app.basePath), not an env
  // var. Resolve it with the same precedence as the rest of the connect
  // config: CLI override > source powerhouse.config.json.
  const connectBasePath =
    options.cliConnectOverride?.app?.basePath ??
    phConfig.connect?.app?.basePath;

  const offlineEnabled =
    options.cliConnectOverride?.app?.offline ??
    phConfig.connect?.app?.offline ??
    true;

  const authToken = env.PH_SENTRY_AUTH_TOKEN;
  const org = env.PH_SENTRY_ORG;
  const project = env.PH_SENTRY_PROJECT;
  // Release tag derived from the workspace version so it matches the
  // sourcemap upload tag CI uses.
  const release =
    process.env.WORKSPACE_VERSION ??
    process.env.npm_package_version ??
    env.PH_CONNECT_VERSION;
  const uploadSentrySourcemaps = authToken && org && project;

  const connectHtmlTags = getConnectHtmlTags({
    registryUrl: phPackageRegistryUrl,
  });

  // Dev needs a placeholder importmap for devReactImportmapPlugin to rewrite;
  // builds get their map from reactSelfHostPlugin's boot script instead.
  const devImportmapTag =
    mode === "development"
      ? [
          {
            tag: "script",
            attrs: { type: "importmap" },
            children: JSON.stringify({ imports: {} }),
            injectTo: "head-prepend" as const,
          },
        ]
      : [];

  const plugins: PluginOption[] = [
    tailwind(),
    react(),
    createHtmlPlugin({
      minify: false,
      inject: {
        tags: [...connectHtmlTags, ...devImportmapTag],
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

  // hide warnings unless LOG_LEVEL is set to debug, or the source config
  // declares connect.app.logLevel = "debug"
  const isDebug =
    process.env.LOG_LEVEL === "debug" ||
    phConfig.connect?.app?.logLevel === "debug";
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

  // PWA overrides ladder: build-time-known package `pwa` fragments merge UNDER
  // the project's `connect.pwa` block (source deep-merged with the CLI/operator
  // override, CLI wins). Scalars are project-wins; arrays (icons, globs,
  // runtime-caching rules, denylist) are additive; the size ceiling takes the
  // max. Fragments come from the configured packages (local from node_modules,
  // registry from the CDN) and, last among packages, the project's own
  // manifest. The user's own connect.pwa is validated strictly (fails the
  // build); package fragments warn + skip inside the collectors.
  const projectPwa = validateProjectPwaConfig(
    deepMerge(
      phConfig.connect?.pwa ?? {},
      options.cliConnectOverride?.pwa ?? {},
    ),
    phConfigPath,
  );
  const pwaWarn = (msg: string) => (customLogger ?? console).warn(msg);
  // Registry fragments need the network, so only production builds fetch them
  // (dev/studio runs without a service worker and must not depend on the
  // registry being reachable). Async: Vite resolves promised plugins, same
  // pattern as the sentry plugin below.
  const pwaPackagesForFragments =
    mode === "production"
      ? phPackages
      : phPackages.filter((p) => p.provider === "local");
  const pwaPlugins: PluginOption = (async () => {
    if (!offlineEnabled) return connectPwaPlugins({ offlineEnabled });
    const contributions = await collectPackagePwaContributions({
      packages: pwaPackagesForFragments,
      projectRoot: options.dirname,
      registryUrl: phPackageRegistryUrl,
      onWarn: pwaWarn,
    });
    const projectContribution = collectProjectPwaContribution({
      projectRoot: options.dirname,
      onWarn: pwaWarn,
    });
    if (projectContribution) contributions.push(projectContribution);
    const mergedPwa = mergePwaConfig(contributions, projectPwa, pwaWarn);
    return connectPwaPlugins({ offlineEnabled, pwa: mergedPwa });
  })();

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
    // (reverse proxy). Mirrors the client router basename; normalize so a bare
    // `app` or `/app` becomes `/app/` and matches the router.
    //
    // Dynamic-base mode: set a placeholder token instead of a concrete base.
    // connectDynamicBasePlugin (below) rewrites it in the emitted JS to a
    // runtime expression so one bundle serves under any subpath; the proxy
    // substitutes it in the HTML and sets the runtime global at serve time.
    base: options.dynamicBase
      ? DYNAMIC_BASE_PLACEHOLDER
      : connectBasePath
        ? normalizeBasePath(connectBasePath)
        : undefined,
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
    define: {
      PH_CONNECT_SENTRY_RELEASE: JSON.stringify(release || "unknown"),
    },
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
      // phConfigPlugin must be registered before tailwind so its hotUpdate
      // hook runs first and can suppress HMR updates for codegen-generated
      // files, preventing tailwind from triggering full page reloads.
      phConfigPlugin({
        packages: phPackages,
        projectRoot: options.dirname,
        connect: phConfig.connect,
        packageRegistryUrl: phPackageRegistryUrl ?? undefined,
        cliConnectOverride: options.cliConnectOverride,
      }),
      phBundledPackagesPlugin({
        packages: localPackagesFromConfig,
        projectRoot: options.dirname,
      }),
      // Dev-only: rewrite the importmap to Vite's pre-bundled React so Connect
      // and CDN editors share one instance (build uses reactSelfHostPlugin).
      devReactImportmapPlugin(options.dirname),
      ...plugins,
      // Externalize React so Connect + CDN editors share one instance via the
      // import map (reactSelfHostPlugin URLs); also rewrites external require().
      esmExternalRequirePlugin({ external: reactExternal }),
      // Build-only: emit the React family into the dist + static import map, so
      // React is self-hosted (not esm.sh). Dev React for non-prod/debug builds.
      reactSelfHostPlugin({
        dirname: options.dirname,
        dev: mode !== "production" || isDebug,
      }),
      connectFaviconPlugin({ faviconPath: options.favicon }),
      // enforce: "post" — rewrites the placeholder base after all other
      // transforms have emitted their asset/chunk URLs.
      ...(options.dynamicBase ? [connectDynamicBasePlugin()] : []),
      // PWA / service worker last, so its precache manifest sees every emitted
      // asset (including the icons connectPwaIconsPlugin emits).
      pwaPlugins,
    ],
    worker: {
      format: "es",
      // Worker chunks are emitted by a separate Rolldown build, so the main
      // bundle's generateBundle never sees them. The worker instance both
      // rewrites the placeholder and prepends a prelude that resolves the base
      // in worker scope (forWorker) — the proxy only sets the global on the
      // main thread.
      ...(options.dynamicBase
        ? { plugins: () => [connectDynamicBasePlugin({ forWorker: true })] }
        : {}),
    },
    build: {
      sourcemap: true,
    },
  };
  return config;
}
