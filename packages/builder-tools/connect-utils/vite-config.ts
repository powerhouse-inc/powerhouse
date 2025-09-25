import { phExternalPackagesPlugin } from "@powerhousedao/builder-tools";
import type { PowerhousePackage } from "@powerhousedao/config";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import type { HtmlTagDescriptor, PluginOption, UserConfig } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";

export type IConnectOptions = {
  env: Record<string, string>;
  packageJsonPath: string;
  packages?: PowerhousePackage[];
  localPackage?: string; // path to local package to be loaded.
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

  // load packages from env variable
  const phPackagesStr = (process.env.PH_PACKAGES ?? env.PH_PACKAGES) || "";
  const envPhPackages = phPackagesStr.split(",");

  // loadPackages from config
  const configPhPackages =
    options.packages?.map((p) => (typeof p === "string" ? p : p.packageName)) ||
    [];

  // merges env and config packages
  const allPackages = [...envPhPackages, ...configPhPackages];

  // if local package is provided, add it to the packages to be loaded
  const localPackage = options.localPackage || process.env.PH_LOCAL_PACKAGE;
  if (localPackage) {
    allPackages.push(localPackage);
  }

  // remove duplicates and empty strings
  const phPackages = [...new Set(allPackages.filter((p) => p.trim().length))];

  const pkg = JSON.parse(readFileSync(options.packageJsonPath, "utf-8")) as {
    version: string;
  };

  const APP_VERSION = (
    process.env.APP_VERSION ||
    env.APP_VERSION ||
    pkg.version
  ).toString();

  const release =
    (process.env.SENTRY_RELEASE ?? env.SENTRY_RELEASE) || APP_VERSION;

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
