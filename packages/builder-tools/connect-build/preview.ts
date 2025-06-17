import { PH_DIR_NAME } from "#connect-utils";
import { join } from "node:path";
import { preview } from "vite";
import { CONNECT_BUILD_DIR_NAME } from "./constants.js";
import { type ConnectPreviewOptions } from "./types.js";

export async function previewConnect(options: ConnectPreviewOptions) {
  const {
    base = process.env.BASE_PATH || "/",
    projectRoot = process.cwd(),
    port = 4173,
    open = true,
  } = options;
  const connectBuildDir = join(
    projectRoot,
    PH_DIR_NAME,
    CONNECT_BUILD_DIR_NAME,
  );
  const previewServer = await preview({
    base: `${base}${base.endsWith("/") ? "" : "/"}`,
    root: connectBuildDir,
    preview: {
      port,
      open,
    },
  });

  previewServer.printUrls();
  previewServer.bindCLIShortcuts({ print: true });
}
