export const SWITCHBOARD = "SWITCHBOARD";
export const LOCAL = "LOCAL" as const;
export const CLOUD = "CLOUD" as const;
export const PUBLIC = "PUBLIC" as const;
export const DRIVE = "DRIVE" as const;
export const FILE = "FILE" as const;
export const FOLDER = "FOLDER" as const;
export const sharingTypes = [LOCAL, CLOUD, PUBLIC] as const;

export const driveLocations = [LOCAL, CLOUD, SWITCHBOARD] as const;

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
