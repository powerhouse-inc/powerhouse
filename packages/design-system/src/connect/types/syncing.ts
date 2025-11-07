import type { syncStatuses } from "../constants/syncing.js";

export type SyncStatuses = typeof syncStatuses;
export type SyncStatus = SyncStatuses[number];
