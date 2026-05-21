import type { PowerhouseConfig } from "@powerhousedao/config";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type { CommonServerOptions } from "vite";

export type IConnectOptions = {
  mode: string;
  dirname: string;
  envDir?: string;
  powerhouseConfig?: PowerhouseConfig;
  watchTimeout?: number;
  /**
   * CLI-supplied connect override. Final (highest precedence) layer of the
   * runtime-config deep-merge ladder applied by `phConfigPlugin`. Forwarded
   * from `ph connect build`'s `--json` + individual `--flag` parsing.
   *
   * Order: DEFAULT_CONNECT_CONFIG < env-seeds < source.connect < cliConnectOverride.
   */
  cliConnectOverride?: PHConnectRuntimeConfig;
  /**
   * CLI override for the top-level `packageRegistryUrl`. Set when the user
   * passes `--packages-registry` to `ph connect build`; wins over the source
   * value in the emitted runtime config.
   */
  cliPackageRegistryUrl?: string;
};

export type ConnectCommonOptions = {
  /* The base path where the app will be deployed. */
  base?: string;
  /* The vite mode to use. Defaults to 'production' */
  mode?: string;
  /* Path to the powerhouse.config.js file to load */
  configFile?: string;
  /* Path to the project root. Defaults to the current directory. */
  projectRoot?: string;
  /* Path to the vite config file to load. Defaults to 'projectRoot/"vite.config.ts' */
  viteConfigFile?: string;
  /* If the local package should be loaded */
  disableLocalPackage?: boolean;
  /* The default drives url to use in connect */
  defaultDrivesUrl?: string[];
  /* The preservation strategy to use on default drives. Defaults to 'preserve-by-url-and-detach'. */
  drivesPreserveStrategy?: "preserve-all" | "preserve-by-url-and-detach";
};

export type ViteDevOptions = Pick<
  CommonServerOptions,
  "port" | "host" | "open" | "cors" | "strictPort"
> & { force?: boolean };

export type ConnectStudioOptions = ConnectCommonOptions & {
  devServerOptions?: ViteDevOptions;
  printUrls?: boolean;
  bindCLIShortcuts?: boolean;
};

export type ConnectBuildOptions = ConnectCommonOptions & {
  /* Output directory. Defaults to 'dist' */
  outDir?: string;
};

export type ConnectPreviewOptions = ConnectCommonOptions &
  Omit<ViteDevOptions, "cors"> & {
    /* Output directory. Defaults to 'dist' */
    outDir?: string;
    printUrls?: boolean;
    bindCLIShortcuts?: boolean;
  };
