import { join } from "node:path";
import { cwd } from "node:process";
import type { CommonServerOptions, InlineConfig, ResolvedConfig } from "vite";

type ViteDevOptions = Pick<
  CommonServerOptions,
  "port" | "host" | "open" | "cors" | "strictPort"
> & { force?: boolean };

export type ConnectStudioOptions = {
  /* Path to the powerhouse.config.js file to load */
  configFile?: string;
  /* If the local package should be loaded */
  disableLocalPackage?: boolean;
  devServerOptions?: ViteDevOptions;
  viteConfig?: InlineConfig | ResolvedConfig;
  printUrls?: boolean;
  bindCLIShortcuts?: boolean;

  /* The default drives url to use in connect */
  defaultDrivesUrl?: string[];
  drivesPreserveStrategy?: "preserve-all" | "preserve-by-url-and-detach";
};

export const ConnectStudioDefaultOptions = {
  printUrls: true,
  bindCLIShortcuts: true,
} as const satisfies ConnectStudioOptions;

async function loadVite() {
  try {
    return await import("vite");
  } catch (error) {
    const viteError = new Error(
      "Could not load 'vite'. Is it installed in your project?",
    );

    throw viteError;
  }
}

function devServerOptionsToConfig(
  devServerOptions: ViteDevOptions = {},
): InlineConfig {
  return {
    server: {
      ...devServerOptions,
    },
  };
}

export async function startConnectStudio(options?: ConnectStudioOptions) {
  const {
    viteConfig,
    printUrls,
    bindCLIShortcuts,
    devServerOptions,
    disableLocalPackage,
    defaultDrivesUrl,
    drivesPreserveStrategy,
  } = {
    ...ConnectStudioDefaultOptions,
    ...options,
  };

  if (defaultDrivesUrl) {
    process.env.PH_CONNECT_DEFAULT_DRIVES_URL = defaultDrivesUrl.join(",");
  }
  if (drivesPreserveStrategy) {
    process.env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY = drivesPreserveStrategy;
  }
  if (disableLocalPackage) {
    process.env.PH_DISABLE_LOCAL_PACKAGES = "true";
  }

  const vite = await loadVite();

  // TODO: support options field instead of using 'cwd()'
  const userViteConfig = viteConfig
    ? viteConfig
    : await vite.loadConfigFromFile(
        { command: "serve", mode: "dev" },
        join(cwd(), "vite.config.ts"),
      );

  const devServerConfig = devServerOptionsToConfig(devServerOptions);
  const mergedConfig = vite.mergeConfig(userViteConfig ?? {}, devServerConfig);
  const server = await vite.createServer(mergedConfig);

  await server.listen();

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
