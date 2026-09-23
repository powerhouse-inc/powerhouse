import type { PurgeOutcome } from "../shared/purge-types.js";

export type PurgeBlocker = "live" | "owed" | "group-in-use";

/** A remote that has not received every operation it would be served. */
export type OwedRemote = {
  documentId: string;
  remoteName: string;
  connectionState: string;
  lastSuccessUtcMs: number;
  cursorOrdinal: number;
  targetOrdinal: number;
  reasons: string[];
};

export type PurgeCandidate = {
  documentId: string;
  /** False for a document added because it was only ever in a purged drive. */
  requested: boolean;
  alreadyPurged: boolean;
  status: PurgeBlocker | "ready";
  blockers: PurgeBlocker[];
  owed: OwedRemote[];
  /** Surviving documents that reference this id as a group. */
  groupUsers: string[];
};

export type PurgePlan = {
  candidates: PurgeCandidate[];
  ready: boolean;
};

export type DocumentPurgeResult = {
  directiveId: string;
  /** "already-purged" when every id carried a tombstone and nothing ran. */
  status: "purged" | "already-purged";
  purged: string[];
  alreadyPurged: string[];
  rowsDeleted: Record<string, number>;
  /** Owed remotes the directive chose to skip. */
  skippedRemotes: OwedRemote[];
  /** Remotes bound to a purged drive's collection, removed with it. */
  removedRemotes: string[];
  readModels: PurgeOutcome[];
  unacknowledgedShards: number[];
  swept: Record<string, number>;
};
