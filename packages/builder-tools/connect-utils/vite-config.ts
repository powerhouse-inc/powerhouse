import { phExternalPackagesPlugin } from "@powerhousedao/builder-tools";
import { getConfig } from "@powerhousedao/config/node";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { join } from "node:path";
import {
  loadEnv,
  type HtmlTagDescriptor,
  type PluginOption,
  type UserConfig,
} from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";
import type { ConnectEnv, IConnectOptions } from "./types.js";

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
  const mode = options.mode;
  const envDir = options.envDir ?? options.dirname;
  const fileEnv = loadEnv(mode, envDir, "PH_");
  const env = { ...fileEnv, ...process.env } as Partial<ConnectEnv>;

  const disableLocalPackages = process.env.DISABLE_LOCAL_PACKAGES === "true";

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
    ) || [];

  // merges env and config packages
  const allPackages = [...envPhPackages, ...configPhPackages];

  // if local package is provided, add it to the packages to be loaded
  const localPackage =
    env.PH_LOCAL_PACKAGE ?? options.localPackage ?? options.dirname;
  if (localPackage && !disableLocalPackages) {
    allPackages.push(localPackage);
  }

  // remove duplicates and empty strings
  const phPackages = [...new Set(allPackages.filter((p) => p.trim().length))];

  const APP_VERSION = (env.PH_CONNECT_VERSION || "unknown").toString();
  process.env.PH_CONNECT_VERSION = APP_VERSION;

  const authToken = env.PH_SENTRY_AUTH_TOKEN;
  const org = env.PH_SENTRY_ORG;
  const project = env.PH_SENTRY_PROJECT;
  const release = env.PH_CONNECT_SENTRY_RELEASE || APP_VERSION;
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
    envDir: envDir,
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
      port: phConfig.studio?.port,
    },
    worker: {
      format: "es",
    },
  };
  return config;
}
