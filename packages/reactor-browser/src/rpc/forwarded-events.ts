import { SyncEventTypes } from "@powerhousedao/reactor";
import { SYNC_STATUS_CHANGED_EVENT } from "./sync-manager-proxy.js";

// Reactor bus events the worker fans out to tabs over the distributed EventBus.
export const FORWARDED_EVENT_TYPES = [
  SyncEventTypes.SYNC_PENDING,
  SyncEventTypes.SYNC_SUCCEEDED,
  SyncEventTypes.SYNC_FAILED,
  SyncEventTypes.DEAD_LETTER_ADDED,
  SyncEventTypes.CONNECTION_STATE_CHANGED,
];

// Every event type a tab-side proxy can receive: the forwarded reactor events plus the synthetic sync-status delta.
export const FORWARDED_BUS_EVENT_TYPES: number[] = [
  ...FORWARDED_EVENT_TYPES,
  SYNC_STATUS_CHANGED_EVENT,
];
