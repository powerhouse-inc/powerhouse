import type { ArgParser } from "cmd-ts/dist/cjs/argparser.js";
import type { getPackageManagerCommand } from "./args/common.js";
import type {
  DRIVES_PRESERVE_STRATEGIES,
  LOG_LEVELS,
  SERVICE_ACTIONS,
} from "./constants.js";

export type ServiceActions = typeof SERVICE_ACTIONS;
export type ServiceAction = ServiceActions[number];
export type DrivePreserveStrategies = typeof DRIVES_PRESERVE_STRATEGIES;
export type DrivePreserveStrategy = DrivePreserveStrategies[number];
export type LogLevels = typeof LOG_LEVELS;
export type LogLevel = LogLevels[number];

export type ParsedCmdResult<P> = P extends ArgParser<infer Out> ? Out : never;
export type PackageManagerArgs = ParsedCmdResult<
  typeof getPackageManagerCommand
>;

export type PHPackageProvider = "npm" | "github" | "local" | "registry";

export type PathValidation = (dir: string) => boolean;
export type PowerhousePackage = {
  packageName: string;
  version?: string;
  provider?: PHPackageProvider;
  url?: string;
};

export type PHConnectBranding = {
  appName?: string;
  homeBackground?: { avif?: string; png?: string } | null;
};

export type PHConnectDefaultDrive = {
  url: string;
  name?: string | null;
  icon?: string | null;
};

export type PHConnectDriveSection = {
  enabled?: boolean;
  allowAdd?: boolean;
  allowDelete?: boolean;
};

export type PHConnectDriveSections = {
  remote?: PHConnectDriveSection;
  local?: PHConnectDriveSection;
};

export type PHConnectDrives = {
  allowAddDrive?: boolean;
  defaultDrives?: PHConnectDefaultDrive[];
  preserveStrategy?: DrivePreserveStrategy;
  sections?: PHConnectDriveSections;
};

export type PHConnectApp = {
  logLevel?: "debug" | "info" | "warn" | "error";
  basePath?: string;
};

export type PHConnectPackages = {
  externalEnabled?: boolean;
};

export type PHConnectRenown = {
  url?: string;
  networkId?: string;
  chainId?: number;
};

export type PHConnectRuntimeConfig = {
  branding?: PHConnectBranding;
  app?: PHConnectApp;
  packages?: PHConnectPackages;
  drives?: PHConnectDrives;
  renown?: PHConnectRenown;
};

export type PowerhouseConfig = {
  // required
  logLevel: LogLevel;
  documentModelsDir: string;
  editorsDir: string;
  processorsDir: string;
  subgraphsDir: string;
  importScriptsDir: string;
  skipFormat: boolean;

  // optional
  interactive?: boolean;
  watch?: boolean;
  reactor?: {
    port?: number;
    https?:
      | undefined
      | boolean
      | {
          keyPath: string;
          certPath: string;
        };
    storage?: {
      type: "filesystem" | "memory" | "postgres" | "browser";
      filesystemPath?: string;
      postgresUrl?: string;
    };
  };
  auth?: {
    enabled?: boolean;
    admins: string[];
    defaultProtection?: boolean;
  };
  switchboard?: {
    database?: {
      url?: string;
    };
    port?: number;
  };
  studio?: {
    port?: number;
    host?: string;
    https: boolean;
    openBrowser?: boolean;
  };
  packages?: PowerhousePackage[];
  vetra?: {
    driveId: string;
    driveUrl: string;
  };
  packageRegistryUrl?: string;
  connect?: PHConnectRuntimeConfig;
};
