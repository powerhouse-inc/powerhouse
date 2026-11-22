import {
  assertConnectBuild,
  cacheHeaders,
  connectBaseOf,
  overrideFromEnv,
  precompressedAssets,
  resolveServedFiles,
  servedFilesStep,
  serveOverrideStep,
  shellSwapFor,
  type ConnectMiddleware,
  type ConnectServeOverride,
} from "@powerhousedao/ph-run/connect-serve";
import path from "node:path";
import type { InlineConfig, Plugin } from "vite";
import type { ConnectPreviewArgs } from "../types.js";
import { switchboardProxy } from "../utils/switchboard-proxy.js";

export * from "@powerhousedao/ph-run/connect-serve";

export async function runConnectPreview(
  args: ConnectPreviewArgs,
  serveOverride?: ConnectServeOverride,
  dirname = process.cwd(),
  {
    proxy,
    serveFiles,
  }: {
    /** The switchboard origin whose paths this server proxies (runner.proxy). */
    proxy?: string;
    /** Files served by name, read against `dirname` (runner.serveFiles). */
    serveFiles?: Readonly<Record<string, string>>;
  } = {},
) {
  // A supervisor can drive the preview via env when no explicit override is
  // passed.
  serveOverride ??= overrideFromEnv();
  const {
    outDir,
    port,
    host,
    open,
    cors,
    strictPort,
    printUrls,
    bindCLIShortcuts,
  } = args;

  const mode = "production";

  const outDirAbs = path.resolve(dirname, outDir);
  assertConnectBuild(outDir, outDirAbs, dirname);
  const base = connectBaseOf(args, outDirAbs, dirname);

  // Build tooling, so only here: a packaged app doesn't have it.
  const { preview } = await import("vite");
  const previewPlugin = (name: string, step: ConnectMiddleware): Plugin => ({
    name,
    configurePreviewServer(server) {
      server.middlewares.use(step);
    },
  });

  const previewConfig: InlineConfig = {
    configFile: false,
    mode,
    base,
    build: {
      outDir: outDirAbs,
    },
    preview: {
      cors,
      port,
      strictPort,
      host,
      open,
      ...(proxy ? { proxy: switchboardProxy(proxy) } : {}),
    },
    plugins: [
      previewPlugin("ph:preview-cache-headers", cacheHeaders(outDirAbs, base)),
      previewPlugin(
        "ph:precompressed-assets",
        precompressedAssets(outDirAbs, base),
      ),
      ...(serveOverride
        ? [
            previewPlugin(
              "ph:serve-override",
              serveOverrideStep(
                outDirAbs,
                serveOverride,
                base,
                shellSwapFor(outDirAbs, serveOverride, base),
                proxy !== undefined,
              ),
            ),
          ]
        : []),
      ...(serveFiles
        ? [
            previewPlugin(
              "ph:serve-files",
              servedFilesStep(resolveServedFiles(serveFiles, dirname), base),
            ),
          ]
        : []),
    ],
  };

  const server = await preview(previewConfig);

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
  return server;
}
