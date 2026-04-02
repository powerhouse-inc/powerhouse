export const LogLevels = {
  verbose: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  silent: 6,
} as const;

export type LogLevel = keyof typeof LogLevels;

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && value in LogLevels;
}
import type { PowerhouseConfig } from "@powerhousedao/shared";
export type {
  PHPackageProvider,
  PowerhousePackage,
} from "@powerhousedao/shared";
export type { PowerhouseConfig };

export const DEFAULT_REGISTRY_URL = "https://registry.prod.vetra.io";

export { DEFAULT_CONFIG } from "@powerhousedao/shared/clis";

export type {
  DocumentModelModule,
  Manifest,
  PowerhouseModule,
  Publisher,
} from "@powerhousedao/shared";

export type VetraProcessorConfigType = {
  interactive?: boolean;
  driveUrl: string;
  driveId: string;
};

export function resolveRegistryConfig(
  config: PowerhouseConfig,
  env: Record<string, string | undefined> = {},
): {
  registryUrl: string | undefined;
  packageNames: string[];
} {
  let registryUrl = config.packageRegistryUrl;
  let packageNames =
    config.packages
      ?.filter((p) => p.provider === "registry")
      .map((p) => p.packageName) ?? [];

  // Env vars override config
  if (env.PH_REGISTRY_URL) {
    registryUrl = env.PH_REGISTRY_URL;
  }
  if (env.PH_REGISTRY_PACKAGES) {
    packageNames = env.PH_REGISTRY_PACKAGES.split(",").map((p) => p.trim());
  }

  return { registryUrl, packageNames };
}

export const VETRA_PROCESSOR_CONFIG_KEY = "VetraConfig";
