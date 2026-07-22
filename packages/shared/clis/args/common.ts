import {
  array,
  boolean,
  command,
  flag,
  multioption,
  number,
  oneOf,
  option,
  optional,
  string,
} from "cmd-ts";
// Sub-path: avoids pulling the package-manager-detector runtime here,
// which `oneOf(AGENTS)` below would force at module load.
import type { Agent } from "package-manager-detector";
import { AGENTS as _AGENTS } from "package-manager-detector/constants";
import {
  DEFAULT_TIMEOUT,
  DRIVES_PRESERVE_STRATEGIES,
  LOG_LEVELS,
} from "../constants.js";
import { getConfig } from "../file-system/get-config.js";

export const AGENTS: Agent[] = _AGENTS;

export const debugArgs = {
  debug: flag({
    type: optional(boolean),
    long: "debug",
    description: "Log arguments passed to this command",
  }),
};

export const buildArgs = {
  outDir: option({
    type: string,
    long: "out-dir",
    description: "Where to output the bundled code",
    defaultValue: () => "dist" as const,
    defaultValueIsSerializable: true,
  }),
  ...debugArgs,
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
export const getPackageManagerCommand = command({
  name: "get-package-manager",
  args: packageManagerArgs,
  handler: (args) => args,
});
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
  }),
  disableLocalPackages,
  ...debugArgs,
};

export const defaultDrivesUrl = option({
  type: optional(string),
  long: "default-drives-url",
  description: "The default drives url to use in connect",
  defaultValue: () => "",
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
  defaultValue: () => "/",
});

export const renownNamespace = option({
  type: optional(string),
  long: "renown-namespace",
  description:
    "Renown localStorage namespace; share it across Connects to share login.",
});

export const renownSwitchboardUrl = option({
  type: optional(string),
  long: "renown-switchboard-url",
  description:
    "Override connect.renown.switchboardUrl. When set, enables in-page Renown sign-in.",
});

export const drivesPreserveStrategy = option({
  type: oneOf(DRIVES_PRESERVE_STRATEGIES),
  long: "drive-preserve-strategy",
  description: "The preservation strategy to use on default drives",
  defaultValue: () => "preserve-by-url-and-detach" as const,
  defaultValueIsSerializable: true,
});

export const force = flag({
  type: optional(boolean),
  long: "force",
  description:
    "Force dep pre-optimization regardless of whether deps have changed.",
});

export const commonArgs = {
  connectBasePath,
  logLevel,
  packages,
  localPackage,
  disableLocalPackages,
  defaultDrivesUrl,
  drivesPreserveStrategy,
  force,
  ...debugArgs,
};

export const commonServerArgs = {
  host: option({
    type: optional(string),
    long: "host",
    description:
      "Expose the server to the network. Pass an IP (e.g. 0.0.0.0) to bind to a specific address.",
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
  }),
};
