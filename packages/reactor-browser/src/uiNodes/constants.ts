export const SWITCHBOARD = "SWITCHBOARD";
export const LOCAL = "LOCAL";
export const CLOUD = "CLOUD";
export const PUBLIC = "PUBLIC";

export const sharingTypes = [LOCAL, CLOUD, PUBLIC] as const;

export const driveLocations = [LOCAL, CLOUD, SWITCHBOARD] as const;

export const DRIVE = "DRIVE";
export const FILE = "FILE";
export const FOLDER = "FOLDER";

export const SYNCING = "SYNCING";
export const SUCCESS = "SUCCESS";
export const CONFLICT = "CONFLICT";
export const MISSING = "MISSING";
export const ERROR = "ERROR";
export const INITIAL_SYNC = "INITIAL_SYNC";

export const syncStatuses = [
  INITIAL_SYNC,
  SYNCING,
  SUCCESS,
  CONFLICT,
  MISSING,
  ERROR,
] as const;
