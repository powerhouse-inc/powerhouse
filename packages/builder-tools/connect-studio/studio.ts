import { dirname, isAbsolute, join } from "path";
import { readJsonFile } from "../connect-utils/helpers.js";
import { startServer } from "./server.js";
import type { ConnectStudioOptions, StartServerOptions } from "./types.js";

export function startConnectStudio(options: ConnectStudioOptions) {
  const serverOptions: StartServerOptions = {};

  if (options.port) {
    process.env.PORT = options.port;
  }

  if (options.host) {
    process.env.HOST = options.host.toString();
  }

  if (typeof options.open === "boolean") {
    serverOptions.open = options.open;
  }

  if (options.configFile) {
    const config = readJsonFile(options.configFile);
    if (!config) return;

    const configFileDir = dirname(options.configFile);

    if (config.packages && config.packages.length > 0) {
      serverOptions.packages = config.packages.map((p) => p.packageName);
    }

    if (config.documentModelsDir) {
      process.env.LOCAL_DOCUMENT_MODELS = isAbsolute(config.documentModelsDir)
        ? config.documentModelsDir
        : join(configFileDir, config.documentModelsDir);
    }

    if (config.editorsDir) {
      process.env.LOCAL_DOCUMENT_EDITORS = isAbsolute(config.editorsDir)
        ? config.editorsDir
        : join(configFileDir, config.editorsDir);
    }

    if (config.studio?.port) {
      process.env.PORT = config.studio.port.toString();
    }

    if (typeof config.studio?.openBrowser === "boolean") {
      process.env.OPEN_BROWSER = config.studio.openBrowser.toString();
    }

    if (config.studio?.host) {
      process.env.HOST = config.studio.host;
    }
  }

  if (options.packages && options.packages.length > 0) {
    serverOptions.packages = options.packages.map((p) => p.packageName);
  }

  if (options.https) {
    serverOptions.https = options.https;
  }

  if (options.phCliVersion) {
    serverOptions.phCliVersion = options.phCliVersion;
  }

  if (options.logLevel) {
    process.env.LOG_LEVEL = options.logLevel;
    serverOptions.logLevel = options.logLevel;
  }

  if (options.enableDocumentsHMR) {
    serverOptions.enableDocumentsHMR = options.enableDocumentsHMR;
  }

  return startServer(serverOptions).catch((error) => {
    throw error;
  });
}
