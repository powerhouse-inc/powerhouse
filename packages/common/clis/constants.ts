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
