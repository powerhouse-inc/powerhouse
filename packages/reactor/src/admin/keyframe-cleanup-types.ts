/** Why a keyframe goes: past the newest `keep` of its stream, or its document is deleted. */
export type KeyframeCleanupReason = "beyond-keep" | "deleted-document";

export type KeyframeCleanupState = "running" | "done" | "cancelled" | "failed";

/**
 * What a run saw. Bytes are the stored (compressed) sizes of the keyframe
 * documents. `removable` is what the rules take; `removed` is what this run
 * really deleted, 0 on a dry run, lower than `removable` when a live write
 * took a row first.
 */
export type KeyframeCleanupTotals = {
  streams: number;
  rows: number;
  bytes: number;
  removableRows: number;
  removableBytes: number;
  removedRows: number;
  removedBytes: number;
};

export type KeyframeCleanupTypeReport = KeyframeCleanupTotals & {
  documentType: string;
  /** The rule in force; null keeps every keyframe. */
  keep: number | null;
  interval: number;
};

export type KeyframeCleanupReasonReport = {
  reason: KeyframeCleanupReason;
  rows: number;
  bytes: number;
};

export type KeyframeCleanupStreamReport = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  reason: KeyframeCleanupReason;
  rows: number;
  bytes: number;
  removableRows: number;
  removableBytes: number;
};

/** One clean-up or dry run; plain data, polled while `state` is running. */
export type KeyframeCleanupRun = {
  id: string;
  dryRun: boolean;
  state: KeyframeCleanupState;
  startedAtUtcMs: number;
  finishedAtUtcMs: number | null;
  /** Documents with keyframes when the run started. */
  documentsTotal: number;
  documentsSeen: number;
  /** True while the catch-up priority is at level 0, which stops the run. */
  parked: boolean;
  totals: KeyframeCleanupTotals;
  /** By stored bytes to remove, then stored bytes. */
  types: KeyframeCleanupTypeReport[];
  reasons: KeyframeCleanupReasonReport[];
  /** The streams with the most stored bytes to remove. */
  topStreams: KeyframeCleanupStreamReport[];
  error: string | null;
};

export type KeyframeReclaimState =
  | "running"
  | "done"
  | "busy"
  | "failed"
  | "unsupported";

/** One reclaim of the `Keyframe` table's disk space. */
export type KeyframeReclaim = {
  state: KeyframeReclaimState;
  startedAtUtcMs: number;
  finishedAtUtcMs: number | null;
  /** `pg_total_relation_size` of the table. */
  tableBytesBefore: number | null;
  tableBytesAfter: number | null;
  /** What the rewrite took, once it ran. */
  durationMs: number | null;
  /** What happened, or what to do by hand. */
  message: string;
};

/** What a store's maintenance answers after rewriting a table. */
export type TableRewriteResult =
  | { outcome: "done"; durationMs: number }
  /** The store never went quiet within the wait. */
  | { outcome: "busy"; reason: string }
  /** The store cannot do it now, e.g. too little free disk. */
  | { outcome: "refused"; reason: string };

export type TableRewriteRequest = {
  schema: string;
  table: string;
  /** Free disk the rewrite needs, about the table's live size. */
  requiredFreeBytes: number;
};

/**
 * A host's way to rewrite one table of its store, in the turn of that store's
 * other work. Only a host that owns its store's connection can offer this.
 */
export interface IStoreMaintenance {
  rewriteTable(request: TableRewriteRequest): Promise<TableRewriteResult>;
}

/** The backlog clean-up of the `Keyframe` table and its disk space. */
export interface IKeyframeCleanup {
  /** Starts a run and answers at once; refused while another one runs. */
  start(options: { dryRun: boolean }): KeyframeCleanupRun;
  /** The running or latest run, null before the first. */
  status(): KeyframeCleanupRun | null;
  /** Stops the running run after its current statement. */
  cancel(): void;
  /** Starts a table rewrite, or says how to do it by hand. */
  reclaim(): Promise<KeyframeReclaim>;
  /** The running or latest reclaim, null before the first. */
  reclaimStatus(): KeyframeReclaim | null;
  /** Ends a running run, for reactor shutdown. */
  shutdown(): Promise<void>;
}
