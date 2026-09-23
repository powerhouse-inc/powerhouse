/** Who asked for a purge, and which safeguards the operator waived. */
export type PurgeDirective = {
  directiveId: string;
  purgedBy?: string;
  /** Remotes the operator accepts will never learn of the deletion. */
  skipRemotes?: string[];
  /** Purge a group even though surviving documents reference it. */
  allowGroupInUse?: boolean;
};

/** An inclusive run of operation-index ordinals removed by a purge. */
export type OrdinalRange = { from: number; to: number };

/** What the purger removed, per reactor-schema table. */
export type PurgeRows = {
  /** Ids tombstoned by this call. */
  purged: string[];
  /** Ids that already carried a tombstone, left as they were. */
  alreadyPurged: string[];
  rowsDeleted: Record<string, number>;
  purgedOrdinals: Record<string, OrdinalRange[]>;
};

/** One read model's answer to a purge. */
export type PurgeOutcome = {
  readModelId: string;
  rowsAffected: number;
  /** False when the model was never taught to purge: not the same as zero rows. */
  covered: boolean;
  error?: string;
  /** Caveats the model wants on the record, e.g. a non-atomic cursor. */
  notes?: string[];
};

/** Every model a fan-out reached, and the shards it could not. */
export type PurgeFanOutOutcome = {
  outcomes: PurgeOutcome[];
  unacknowledgedShards: number[];
};
