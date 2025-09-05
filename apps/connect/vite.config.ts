import {
  viteConnectDevStudioPlugin,
  viteLoadExternalPackages,
} from "@powerhousedao/builder-tools";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import type { HtmlTagDescriptor, PluginOption, UserConfig } from "vite";
import { defineConfig, loadEnv } from "vite";
import { viteEnvs } from "vite-envs";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";
import clientConfig from "./client.config.js";
import pkg from "./package.copy.json" with { type: "json" };
export default defineConfig(({ mode }) => {
  const outDir = path.resolve(__dirname, "./dist");
  const isProd = mode === "production";
  const env = loadEnv(mode, process.cwd());

  const APP_VERSION = (
    process.env.APP_VERSION ??
    env.APP_VERSION ??
    pkg.version
  ).toString();

  const authToken = process.env.SENTRY_AUTH_TOKEN ?? env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG ?? env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT ?? env.SENTRY_PROJECT;
  const release =
    (process.env.SENTRY_RELEASE ?? env.SENTRY_RELEASE) || APP_VERSION;
  const uploadSentrySourcemaps = authToken && org && project;

  const phPackagesStr = process.env.PH_PACKAGES ?? env.PH_PACKAGES;
  const phPackages =
    phPackagesStr?.split(",").filter((p) => p.trim().length) || [];

  const wrapViteEnvs = (): PluginOption => {
    const viteEnvsPlugin = viteEnvs({
      computedEnv() {
        return {
          APP_VERSION,
          SENTRY_RELEASE: release,
        };
      },
    });
    return {
      ...viteEnvsPlugin,
      closeBundle() {
        try {
          return viteEnvsPlugin.closeBundle();
        } catch (error) {
          console.error(error);
        }
      },
    };
  };

  const plugins: PluginOption[] = [
    nodePolyfills({
      include: ["events"],
      globals: {
        process: true,
      },
    }),
    tailwind(),
    svgr(),
    react(),
    viteConnectDevStudioPlugin(false, outDir, env),
    viteLoadExternalPackages(
      false,
      phPackages,
      path.resolve(__dirname, "./public"),
    ),
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
    wrapViteEnvs(),
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
    optimizeDeps: {
      exclude: ["@electric-sql/pglite"],
    },
    plugins,
    build: {
      minify: false,
      sourcemap: true,
      rollupOptions: {
        external: ["vite-plugin-node-polyfills"],
      },
    },
    worker: {
      format: "es",
    },
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __REQUIRES_HARD_REFRESH__: false,
    },
  };
  return config;
});
