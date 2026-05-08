export interface SyncDriverConfig {
  url: string;
  branch: string;
  registryUrl: string;
  jwt?: string;
}

export interface MailboxSnapshot {
  size: number;
  ackOrdinal: number;
  latestOrdinal: number;
}

export interface DriverState {
  inbox: MailboxSnapshot;
  outbox: MailboxSnapshot;
  deadLetter: MailboxSnapshot;
  queueTotal: number;
  queueDrained: boolean;
}

export type EventKind =
  | "JOB_PENDING"
  | "JOB_RUNNING"
  | "JOB_WRITE_READY"
  | "JOB_READ_READY"
  | "JOB_FAILED"
  | "SYNC_PENDING"
  | "SYNC_SUCCEEDED"
  | "SYNC_FAILED"
  | "DEAD_LETTER_ADDED"
  | "CONNECTION_STATE_CHANGED"
  | "INBOX_ADDED"
  | "INBOX_REMOVED"
  | "OUTBOX_ADDED"
  | "OUTBOX_REMOVED"
  | "DEADLETTER_ADDED";

export interface ObservedEvent {
  ts: number;
  kind: EventKind;
  detail: unknown;
}

export interface EnvelopeSummary {
  envelopeId: string;
  documentId: string;
  documentType: string;
  scopes: string[];
  branch: string;
  opCount: number;
  firstIndex: number;
  lastIndex: number;
  firstOrdinal: number;
  lastOrdinal: number;
  actionTypes: string[];
  hasCreate: boolean;
}

export interface InboxAddedDetail {
  count: number;
  envelopes: EnvelopeSummary[];
}

export interface OutboxItemPerScope {
  scope: string;
  firstIndex: number;
  lastIndex: number;
  firstOrdinal: number;
  lastOrdinal: number;
  actionTypes: string[];
}

export interface OutboxItemDetail {
  id: string;
  documentId: string;
  branch: string;
  opCount: number;
  perScope: OutboxItemPerScope[];
}

export interface WatcherConfig {
  drainQuietMs: number;
  stallTimeoutMs: number;
  maxPolls: number;
  ringBufferSize: number;
  verbose: boolean;
}
