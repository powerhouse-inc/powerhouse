import { SyncEventTypes } from "@powerhousedao/reactor";
import { SYNC_STATUS_CHANGED_EVENT } from "./sync-manager-proxy.js";

export const FORWARDED_EVENT_TYPES = [
  SyncEventTypes.SYNC_PENDING,
  SyncEventTypes.SYNC_SUCCEEDED,
  SyncEventTypes.SYNC_FAILED,
  SyncEventTypes.DEAD_LETTER_ADDED,
  SyncEventTypes.CONNECTION_STATE_CHANGED,
];

export const FORWARDED_BUS_EVENT_TYPES: number[] = [
  ...FORWARDED_EVENT_TYPES,
  SYNC_STATUS_CHANGED_EVENT,
];
