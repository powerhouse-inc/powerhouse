import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import type { InlineConfig } from "vite";
import { mergeConfig, preview } from "vite";
import type { ConnectPreviewArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";

export async function runConnectPreview(args: ConnectPreviewArgs) {
  const {
    outDir,
    connectBasePath,
    port,
    host,
    open,
    cors,
    strictPort,
    printUrls,
    bindCLIShortcuts,
  } = args;

  assignEnvVars(args);

  const mode = "production";

  const dirname = process.cwd();

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
  });

  const previewConfig: InlineConfig = {
    build: {
      outDir,
    },
    preview: {
      cors,
      port,
      strictPort,
      host,
      open,
    },
  };

  const config = mergeConfig(baseConfig, previewConfig);

  const server = await preview(config);

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
