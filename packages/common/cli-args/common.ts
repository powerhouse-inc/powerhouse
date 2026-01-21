import { getConfig } from "@powerhousedao/config/node";
import {
  array,
  boolean,
  flag,
  multioption,
  number,
  oneOf,
  option,
  optional,
  string,
} from "cmd-ts";
import { AGENTS } from "package-manager-detector";
import {
  DEFAULT_TIMEOUT,
  DRIVES_PRESERVE_STRATEGIES,
  LOG_LEVELS,
} from "./constants.js";

export const debugArgs = {
  debug: flag({
    type: optional(boolean),
    long: "debug",
    description: "Log arguments passed to this command",
  }),
};

export const packageManagerArgs = {
  packageManager: option({
    type: optional(oneOf(AGENTS)),
    long: "package-manager",
    short: "p",
    description:
      "Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.",
  }),
  npm: flag({
    type: optional(boolean),
    long: "npm",
    description: "Use 'npm' as package manager",
  }),
  pnpm: flag({
    type: optional(boolean),
    long: "pnpm",
    description: "Use 'pnpm' as package manager",
  }),
  yarn: flag({
    type: optional(boolean),
    long: "yarn",
    description: "Use 'yarn' as package manager",
  }),
  bun: flag({
    type: optional(boolean),
    long: "bun",
    description: "Use 'bun' as package manager",
  }),
};

export const packages = option({
  type: optional(string),
  long: "packages",
  description: "Comma-separated list of package names to load",
  env: "PH_PACKAGES" as const,
});

export const localPackage = option({
  type: optional(string),
  long: "local-package",
  description: "Path to local package to load during development",
  env: "PH_LOCAL_PACKAGE" as const,
});

export const disableLocalPackages = flag({
  type: boolean,
  long: "ignore-local",
  description: "Do not load local packages from this project",
  defaultValue: () => false,
  env: "PH_DISABLE_LOCAL_PACKAGE" as const,
});

export const httpsKeyFile = option({
  type: optional(string),
  long: "https-key-file",
  description: "path to the ssl key file",
  defaultValue: () => {
    const baseConfig = getConfig();
    const https = baseConfig.reactor?.https;
    if (https === undefined) return undefined;
    if (typeof https === "boolean") return undefined;
    return https.keyPath;
  },
  defaultValueIsSerializable: true,
});

export const httpsCertFile = option({
  type: optional(string),
  long: "https-cert-file",
  description: "path to the ssl cert file",
  defaultValue: () => {
    const baseConfig = getConfig();
    const https = baseConfig.reactor?.https;
    if (https === undefined) return undefined;
    if (typeof https === "boolean") return undefined;
    return https.certPath;
  },
  defaultValueIsSerializable: true,
});

export const https = flag({
  type: optional(boolean),
  long: "https",
  description: "Use https",
  defaultValue: () => {
    const baseConfig = getConfig();
    const https = baseConfig.reactor?.https;
    if (typeof https === "boolean") return https;
    return undefined;
  },
  defaultValueIsSerializable: true,
});

export const vetraSwitchboardArgs = {
  https,
  httpsKeyFile,
  httpsCertFile,
  dev: flag({
    type: optional(boolean),
    long: "dev",
    description: "enable development mode to load local packages",
  }),
  remoteDrives: multioption({
    type: array(string),
    long: "remote-drives",
    description: "Specify remote drive URLs to use",
    defaultValue: () => [],
    defaultValueIsSerializable: true,
  }),
  disableLocalPackages,
  ...debugArgs,
};

export const defaultDrivesUrl = option({
  type: optional(string),
  long: "default-drives-url",
  description: "The default drives url to use in connect",
  env: "PH_CONNECT_DEFAULT_DRIVES_URL" as const,
});

export const logLevel = option({
  type: oneOf(LOG_LEVELS),
  long: "log-level",
  description: "Log level for the application",
  defaultValue: () => "info" as const,
  defaultValueIsSerializable: true,
  env: "PH_CONNECT_LOG_LEVEL" as const,
});

export const connectBasePath = option({
  long: "base",
  type: string,
  description: "Base path for the app",
  env: "PH_CONNECT_BASE_PATH" as const,
  defaultValue: () => process.cwd(),
  defaultValueIsSerializable: true,
});

export const drivesPreserveStrategy = option({
  type: oneOf(DRIVES_PRESERVE_STRATEGIES),
  long: "The preservation strategy to use on default drives",
  defaultValue: () => "preserve-by-url-and-detach" as const,
  defaultValueIsSerializable: true,
  env: "PH_CONNECT_DRIVES_PRESERVE_STRATEGY" as const,
});

export const forceOptimizeDeps = flag({
  type: optional(boolean),
  long: "force",
});

export const commonArgs = {
  connectBasePath,
  logLevel,
  packages,
  localPackage,
  disableLocalPackages,
  defaultDrivesUrl,
  drivesPreserveStrategy,
  forceOptimizeDeps,
  ...debugArgs,
};

export const commonServerArgs = {
  host: flag({
    type: optional(boolean),
    long: "host",
    description: "Expose the server to the network",
  }),
  open: flag({
    type: optional(boolean),
    long: "open",
    description: "Open browser on startup",
  }),
  cors: flag({
    type: optional(boolean),
    long: "cors",
    description: "Enable CORS",
  }),
  strictPort: flag({
    type: optional(boolean),
    long: "strictPort",
    description: "Exit if specified port is already in use",
  }),
  printUrls: flag({
    type: boolean,
    long: "print-urls",
    description: "Print server urls",
    defaultValue: () => true,
    defaultValueIsSerializable: true,
  }),
  bindCLIShortcuts: flag({
    type: boolean,
    long: "bind-cli-shortcuts",
    description: "Bind CLI shortcuts",
    defaultValue: () => true,
    defaultValueIsSerializable: true,
  }),
  watchTimeout: option({
    type: number,
    long: "watch-timeout",
    description: "Amount of time to wait before a file is considered changed",
    defaultValue: () => DEFAULT_TIMEOUT,
    defaultValueIsSerializable: true,
    env: "PH_WATCH_TIMEOUT" as const,
  }),
};
