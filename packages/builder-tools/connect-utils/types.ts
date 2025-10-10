import type { PowerhouseConfig } from "@powerhousedao/config";
import type { CommonServerOptions } from "vite";

export type IConnectOptions = {
  mode: string;
  dirname: string;
  envDir?: string;
  powerhouseConfig?: PowerhouseConfig;
  localPackage?: string | false; // path to local package to be loaded.
};

// Re-export types from env-config
export type {
  ConnectBuildEnv,
  ConnectEnv,
  ConnectRuntimeEnv,
} from "./env-config.js";

export type ConnectCommonOptions = {
  /* The base path where the app will be deployed. */
  base?: string;
  /* The vite mode to use. Defaults to 'production' */
  mode?: string;
  /* Path to the powerhouse.config.js file to load */
  configFile?: string;
  /* Path to the project root. Defauls to the current directory. */
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
