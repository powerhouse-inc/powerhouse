import { homedir } from "node:os";
import { join } from "node:path";

export const SERVICE_ACTIONS = [
  "start",
  "stop",
  "status",
  "setup",
  "restart",
] as const;

export const SECONDS_IN_DAY = 24 * 60 * 60;
export const DEFAULT_EXPIRY_DAYS = 7;
export const DEFAULT_EXPIRY_SECONDS = DEFAULT_EXPIRY_DAYS * SECONDS_IN_DAY;

export const DRIVES_PRESERVE_STRATEGIES = [
  "preserve-all",
  "preserve-by-url-and-detach",
] as const;

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export const DEFAULT_TIMEOUT = 300 as const;

export const DEFAULT_CONNECT_STUDIO_PORT = 3000 as const;

export const DEFAULT_VETRA_CONNECT_PORT = 3001 as const;

export const DEFAULT_CONNECT_PREVIEW_PORT = 4173 as const;

export const DEFAULT_CONNECT_OUTDIR = ".ph/connect-build/dist/" as const;

export const DEFAULT_RENOWN_URL = "https://www.renown.id" as const;

export const DEFAULT_SWITCHBOARD_PORT = 4001 as const;

export const DEFAULT_VETRA_DRIVE_ID = "vetra" as const;

export const MINIMUM_NODE_VERSION = "22.0.0" as const;
export const PH_BIN = "ph-cli-legacy" as const;
export const POWERHOUSE_CONFIG_FILE = "powerhouse.config.json" as const;
export const PH_GLOBAL_DIR_NAME = ".ph" as const;
// Keep PH_GLOBAL_PROJECT_NAME for backwards compatibility
export const PH_GLOBAL_PROJECT_NAME = PH_GLOBAL_DIR_NAME;

export const HOME_DIR = homedir();

export const POWERHOUSE_GLOBAL_DIR = join(HOME_DIR, PH_GLOBAL_DIR_NAME);

export const VERSIONED_DEPENDENCIES = [
  "@powerhousedao/common",
  "@powerhousedao/design-system",
  "@powerhousedao/vetra",
  "@powerhousedao/builder-tools",
  "document-model",
];

export const VERSIONED_DEV_DEPENDENCIES = [
  "@powerhousedao/codegen",
  "@powerhousedao/config",
  "@powerhousedao/ph-cli",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor-local",
  "@powerhousedao/switchboard",
  "@powerhousedao/connect",
  "document-drive",
];
