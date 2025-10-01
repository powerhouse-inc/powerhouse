import { phExternalPackagesPlugin } from "@powerhousedao/builder-tools";
import type { PowerhouseConfig } from "@powerhousedao/config";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  HtmlTagDescriptor,
  loadEnv,
  PluginOption,
  UserConfig,
} from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";

export type IConnectOptions = {
  dirname: string;
  env: ReturnType<typeof loadEnv>;
  powerhouseConfig?: PowerhouseConfig;
  localPackage?: string | false; // path to local package to be loaded.
};

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

export function getConnectBaseViteConfig(options: IConnectOptions) {
  const env = options.env;
  const packageJsonPath = path.resolve(options.dirname, "./package.json");
  // load packages from env variable
  const phPackagesStr = (process.env.PH_PACKAGES ?? env.PH_PACKAGES) || "";
  const envPhPackages = phPackagesStr.split(",");

  // loadPackages from config
  const configPhPackages =
    options.powerhouseConfig?.packages?.map((p) =>
      typeof p === "string" ? p : p.packageName,
    ) || [];

  // merges env and config packages
  const allPackages = [...envPhPackages, ...configPhPackages];

  // if local package is provided, add it to the packages to be loaded
  const localPackage =
    options.localPackage ?? process.env.PH_LOCAL_PACKAGE ?? options.dirname;
  if (localPackage) {
    allPackages.push(localPackage);
  }

  // remove duplicates and empty strings
  const phPackages = [...new Set(allPackages.filter((p) => p.trim().length))];

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      version: string;
    };
  } catch (error) {
    console.error("Failed to read package.json:", error);
  }

  const APP_VERSION = (
    process.env.APP_VERSION ||
    env.APP_VERSION ||
    pkg?.version ||
    "unknown"
  ).toString();

  const authToken = process.env.SENTRY_AUTH_TOKEN ?? env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG ?? env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT ?? env.SENTRY_PROJECT;
  const release =
    (process.env.SENTRY_RELEASE ?? env.SENTRY_RELEASE) || APP_VERSION;
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
    phExternalPackagesPlugin(phPackages),
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
          name: release,
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

  const config: UserConfig = {
    base: "./",
    envPrefix: ["PH_CONNECT_"],
    optimizeDeps: {
      exclude: ["@electric-sql/pglite"],
    },
    plugins,
    build: {
      minify: false,
      sourcemap: true,
    },
    server: {
      fs: {
        strict: false,
      },
    },
    worker: {
      format: "es",
    },
    define: {
      // TODO: replace with env variables?
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __SENTRY_RELEASE__: JSON.stringify(release),
      __REQUIRES_HARD_REFRESH__: false,
    },
  };
  return config;
}
