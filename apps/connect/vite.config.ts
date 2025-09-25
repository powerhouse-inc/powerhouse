import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PluginOption, UserConfig } from "vite";
import { defineConfig, loadEnv, mergeConfig } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const packageJsonPath = path.resolve(import.meta.dirname, "./package.json");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

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
  const baseConnectViteConfig = getConnectBaseViteConfig({
    env,
    packageJsonPath,
  });

  const additionalViteConfig: UserConfig = {
    plugins: [],
  };

  if (uploadSentrySourcemaps) {
    additionalViteConfig.plugins?.push(
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

  const config = mergeConfig(baseConnectViteConfig, additionalViteConfig);
  return config;
});
