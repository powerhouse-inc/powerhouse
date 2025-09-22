import type { PowerhousePackage } from "@powerhousedao/config";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { HtmlTagDescriptor, PluginOption, UserConfig } from "vite";
import { defineConfig, loadEnv } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";
import clientConfig from "./client.config.js";

/**
 * Takes a list of Powerhouse project packages, by name or path and
 * returns a js module that exports those packages for use in Connect.
 */
function makeImportScriptFromPackages(packages: string[]) {
  const imports: string[] = [];
  const moduleNames: string[] = [];
  let counter = 0;

  for (const packageName of packages) {
    const moduleName = `module${counter}`;
    moduleNames.push(moduleName);
    imports.push(`import * as ${moduleName} from '${packageName}';`);
    imports.push(`import '${packageName}/style.css';`);
    counter++;
  }

  const exports = moduleNames.map(
    (name, index) => `{
      id: "${packages[index]}",
      ...${name},
    }`,
  );

  const exportsString = exports.length
    ? `
        ${exports.join(",\n")}
    `
    : "";

  const exportStatement = `export default [${exportsString}];`;

  const fileContent = `${imports.join("\n")}\n\n${exportStatement}`;

  return fileContent;
}

export interface IConnectOptions {
  packages?: (PowerhousePackage | string)[];
  localPackage?: string; // path to local package to be loaded.
}

export const connectViteConfig = (options: IConnectOptions = {}) =>
  defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd());

    // load packages from env variable
    const phPackagesStr = (process.env.PH_PACKAGES ?? env.PH_PACKAGES) || "";
    const envPhPackages = phPackagesStr.split(",");

    // loadPackages from config
    const configPhPackages =
      options.packages?.map((p) =>
        typeof p === "string" ? p : p.packageName,
      ) || [];

    // merges env and config packages
    const allPackages = [...envPhPackages, ...configPhPackages];

    // if local package is provided, add it to the packages to be loaded
    const localPackage = options.localPackage || process.env.PH_LOCAL_PACKAGE;
    if (localPackage) {
      allPackages.push(localPackage);
    }

    // remove duplicates and empty strings
    const phPackages = [...new Set(allPackages.filter((p) => p.trim().length))];

    const pkg = JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, "../package.json"),
        "utf-8",
      ),
    );

    const APP_VERSION = (
      process.env.APP_VERSION ||
      env.APP_VERSION ||
      pkg.version
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
      {
        name: "ph-external-packages",
        enforce: "pre",
        resolveId(id) {
          if (id === "ph:external-packages") {
            return "ph:external-packages";
          }
        },
        load(id) {
          if (id === "ph:external-packages") {
            return makeImportScriptFromPackages(phPackages);
          }
        },
      },
      // viteConnectDevStudioPlugin(false, outDir, env),
      createHtmlPlugin({
        minify: false,
        inject: {
          tags: [
            ...(clientConfig.meta.map((meta) => ({
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
  });

export default connectViteConfig();
