import { getConfig } from "@powerhousedao/config/node";
import {
  array,
  boolean,
  command,
  flag,
  multioption,
  oneOf,
  option,
  optional,
  string,
} from "cmd-ts";
import { AGENTS } from "package-manager-detector";

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
export const getPackageManagerCommand = command({
  name: "get-package-manager",
  args: packageManagerArgs,
  handler: (args) => args,
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
