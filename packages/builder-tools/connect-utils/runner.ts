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
  const { viteConfig, printUrls, bindCLIShortcuts, devServerOptions } = {
    ...ConnectStudioDefaultOptions,
    ...options,
  };
  const vite = await loadVite();

  const devServerConfig = devServerOptionsToConfig(devServerOptions);
  const mergedConfig = vite.mergeConfig(viteConfig ?? {}, devServerConfig);
  const server = await vite.createServer(mergedConfig);

  await server.listen();

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
