import type { Job } from "../queue/types.js";
import type { DeadLetterRecord } from "../storage/interfaces.js";
import type {
  ConnectionStateSnapshot,
  RemoteFilter,
  RemoteOptions,
  RemotePeer,
} from "../sync/types.js";
import type { StorageHealth } from "./types.js";

/**
 * The WIRE contract of the reactor inspection surface: the records that cross
 * an HTTP boundary between a reactor-api host serving its inspection subgraph
 * (`packages/reactor-api/src/graphql/inspection`) and a client inspecting that
 * reactor through it (`packages/reactor-monitor/src/remote`).
 *
 * It lives here, beside `IInspector` and `ISyncInspector` themselves, because
 * it is ONE contract with two ends and neither package may depend on the other:
 * reactor-monitor ships to the browser and reactor-api is a server package, so
 * before this module each end carried its own transcription of the same records
 * and the only thing holding them together was that someone had typed them the
 * same way twice. Both ends now import these types, and
 * {@link INSPECTION_WIRE_FIELDS} pins the server's SDL against them.
 *
 * Every type here is the JSON-safe form of a reactor type, which is why none of
 * them is the reactor type itself:
 *
 * - a `Date` does not survive JSON, so `lastErrorTimestamp` travels as epoch
 *   milliseconds (`lastErrorTimestampUtcMs`);
 * - an absent optional travels as an explicit `null`, because a GraphQL field
 *   that was selected is always present in the response, and the client drops
 *   the null back to the absent optional its reactor type declares;
 * - `DriveCollectionId` loses its prototype, so a remote's configuration
 *   arrives as the plain-object {@link WireRemoteMeta} and is rehydrated;
 * - every field is optional on {@link WireRemoteMeta} and
 *   {@link WireChannelConfig}, because that is what actually arrives: the
 *   server pairs an inspection with a remote's configuration and a remote that
 *   vanished between the two comes back as identity alone.
 */

/** A remote's channel configuration as JSON delivers it; neither half is guaranteed. */
export type WireChannelConfig = {
  readonly type?: string;
  readonly parameters?: Record<string, unknown>;
};

/**
 * `RemoteMeta` as JSON delivers it. Typing it as `RemoteMeta` would make a
 * rehydrator's defensive defaults look like dead code while remaining the only
 * thing standing between untrusted wire data and a `TypeError` in a UI.
 */
export type WireRemoteMeta = {
  readonly id: string;
  readonly name?: string;
  readonly collectionId?: {
    readonly driveId?: string;
    readonly branch?: string;
  };
  readonly channelConfig?: WireChannelConfig;
  readonly filter?: RemoteFilter;
  readonly options?: RemoteOptions;
  readonly peer?: RemotePeer;
};

/**
 * What a reactor reports about ITSELF over the inspection surface: the facts a
 * caller on the far side of HTTP cannot derive, plus which inspection tiers
 * that deployment has opted into.
 *
 * `hosting` and `inspection` are reported rather than computed so a client's
 * capability row is a read of the server's own answer instead of an assumption
 * about the endpoint it happens to be talking to.
 *
 * The two tier flags are the one part of this record that can CHANGE for a
 * given endpoint without the handle changing: an operator restarts the host
 * with `PH_INSPECTION_ADMIN=true`. A client therefore re-reads them rather than
 * caching them for the life of a handle.
 */
export type WireReactorInspectionInfo = {
  readonly hosting: string;
  readonly inspection: string;
  /** The server's own store class ("postgres" or "pglite"), informational. */
  readonly storageKind: string;
  readonly processors: boolean;
  readonly workflows: boolean;
  readonly syncChannels: readonly string[];
  /** Whether the host serves the mutating inspection ops at all. */
  readonly adminEnabled: boolean;
  /** Whether the host serves raw SQL against the reactor store. */
  readonly sqlEnabled: boolean;
};

/** The wire form of {@link import("./types.js").QueueStateSnapshot}; the job records ride a JSON scalar. */
export type WireQueueState = {
  readonly isPaused: boolean;
  readonly totalPending: number;
  readonly totalExecuting: number;
  readonly pendingJobs: Job[];
  readonly executingJobs: Job[];
};

/**
 * The wire form of {@link import("./types.js").InspectorDocumentModelInfo}.
 * Every field is JSON-safe already; versions are small bounded module numbers,
 * not reactor ordinals, so they ride `Int`.
 */
export type WireInspectorDocumentModel = {
  readonly documentType: string;
  readonly name: string;
  readonly version: number;
  readonly supportedVersions: number[];
};

/** The wire form of {@link import("./types.js").InspectorDriveInfo}. */
export type WireInspectorDrive = {
  readonly driveId: string;
  readonly name: string;
  readonly branch: string;
  readonly collectionId: string;
  readonly documentType: string;
  readonly nodeCount: number;
  readonly fileCount: number;
  readonly folderCount: number;
  readonly otherNodeCount: number;
  readonly unreadableNodeCount: number;
  /** An absent icon travels as an explicit null. */
  readonly icon: string | null;
};

/** The wire form of {@link import("./types.js").InspectorDrivePage}. */
export type WireInspectorDrivePage = {
  readonly results: WireInspectorDrive[];
  readonly nextCursor: string | null;
};

/** The wire form of {@link import("./types.js").InspectorDriveIntegrityRef}. */
export type WireInspectorDriveIntegrityRef = {
  readonly id: string;
  readonly documentType: string;
};

/** The wire form of {@link import("./types.js").InspectorDriveIntegrity}. */
export type WireInspectorDriveIntegrity = {
  readonly driveId: string;
  readonly checkedNodeCount: number;
  readonly totalFileNodeCount: number;
  readonly missingDocuments: WireInspectorDriveIntegrityRef[];
  readonly unsupportedTypes: WireInspectorDriveIntegrityRef[];
};

/** The wire form of {@link import("./types.js").InspectorAttachmentInfo}. */
export type WireInspectorAttachmentInfo = {
  readonly present: boolean;
  readonly storeKind: string;
  readonly hasReplicator: boolean;
  readonly replicatorRunning: boolean;
  readonly backlogScanned: boolean;
  readonly refsSeen: number;
  readonly held: number;
  readonly bytesHeld: number;
  readonly queued: number;
  readonly fetching: number;
  readonly pendingFetches: number;
  readonly waiting: number;
  readonly notFound: number;
  readonly failed: number;
  /** An absent error travels as an explicit null. */
  readonly lastError: string | null;
};

/** The wire form of {@link import("./types.js").InspectorProcessorInfo}. */
export type WireInspectorProcessor = {
  readonly processorId: string;
  readonly factoryId: string;
  readonly driveId: string;
  readonly processorIndex: number;
  readonly lastOrdinal: number;
  readonly status: string;
  readonly lastError: string | null;
  readonly lastErrorTimestampUtcMs: number | null;
};

/** The wire form of {@link import("./types.js").StorageHealth}. */
export type WireStorageHealth = {
  readonly healthy: boolean;
  readonly everRecreated: boolean;
  readonly recreateCount: number;
  readonly lastRecreated: StorageHealth["lastRecreated"] | null;
};

/** The wire form of `RemoteCursorInfo`. */
export type WireRemoteCursor = {
  readonly cursorType: "inbox" | "outbox";
  readonly cursorOrdinal: number;
  readonly lastSyncedAtUtcMs: number | null;
  readonly liveAckOrdinal: number;
  readonly liveLatestOrdinal: number;
};

/** The wire form of `MailboxDepths`. */
export type WireMailboxDepths = {
  readonly inbox: number;
  readonly outbox: number;
  readonly deadLetter: number;
};

/** The wire form of `RemoteConnectionHealth`. */
export type WireRemoteConnectionHealth = {
  readonly snapshot: ConnectionStateSnapshot;
  readonly neverSucceeded: boolean;
  readonly stalenessMs: number | null;
};

/**
 * One remote's `RemoteSyncInspection` plus its configuration, in one record, so
 * one request feeds both a client's remote LIST and its inspection view.
 */
export type WireRemoteSyncInspection = {
  readonly remoteName: string;
  readonly remoteId: string;
  readonly inboxCursor: WireRemoteCursor;
  readonly outboxCursor: WireRemoteCursor;
  readonly mailboxDepths: WireMailboxDepths;
  readonly connection: WireRemoteConnectionHealth;
  readonly meta: WireRemoteMeta;
};

/** The wire form of `DeadLetterPage`. */
export type WireDeadLetterPage = {
  readonly remoteName: string;
  readonly results: DeadLetterRecord[];
  readonly nextCursor: string | null;
};

/**
 * The field set of every wire record above, keyed by the GraphQL type name the
 * inspection subgraph serves it as.
 *
 * The drift guard between the two ends. reactor-api's test asserts the SDL's
 * fields for each of these types against this table, so adding a field to a
 * wire type without serving it (or serving one nobody declared) fails there
 * rather than on the far side of HTTP; reactor-monitor builds its GraphQL
 * selection sets from the same table, so a client cannot ask for a field this
 * contract does not have. Pinning root field NAMES alone -- which is all the
 * first cut of W3.2 did -- leaves every record's shape unpinned, which is
 * exactly where a wire contract actually drifts.
 */
export const INSPECTION_WIRE_FIELDS = {
  InspectionDocumentModel: [
    "documentType",
    "name",
    "version",
    "supportedVersions",
  ],
  InspectionDrive: [
    "driveId",
    "name",
    "branch",
    "collectionId",
    "documentType",
    "nodeCount",
    "fileCount",
    "folderCount",
    "otherNodeCount",
    "unreadableNodeCount",
    "icon",
  ],
  InspectionDrivePage: ["results", "nextCursor"],
  InspectionDriveIntegrityRef: ["id", "documentType"],
  InspectionDriveIntegrity: [
    "driveId",
    "checkedNodeCount",
    "totalFileNodeCount",
    "missingDocuments",
    "unsupportedTypes",
  ],
  InspectionAttachmentInfo: [
    "present",
    "storeKind",
    "hasReplicator",
    "replicatorRunning",
    "backlogScanned",
    "refsSeen",
    "held",
    "bytesHeld",
    "queued",
    "fetching",
    "pendingFetches",
    "waiting",
    "notFound",
    "failed",
    "lastError",
  ],
  ReactorInspectionInfo: [
    "hosting",
    "inspection",
    "storageKind",
    "processors",
    "workflows",
    "syncChannels",
    "adminEnabled",
    "sqlEnabled",
  ],
  InspectionQueueState: [
    "isPaused",
    "totalPending",
    "totalExecuting",
    "pendingJobs",
    "executingJobs",
  ],
  InspectionProcessor: [
    "processorId",
    "factoryId",
    "driveId",
    "processorIndex",
    "lastOrdinal",
    "status",
    "lastError",
    "lastErrorTimestampUtcMs",
  ],
  InspectionStorageHealth: [
    "healthy",
    "everRecreated",
    "recreateCount",
    "lastRecreated",
  ],
  InspectionCursor: [
    "cursorType",
    "cursorOrdinal",
    "lastSyncedAtUtcMs",
    "liveAckOrdinal",
    "liveLatestOrdinal",
  ],
  InspectionMailboxDepths: ["inbox", "outbox", "deadLetter"],
  InspectionConnectionHealth: ["snapshot", "neverSucceeded", "stalenessMs"],
  InspectionRemote: [
    "remoteName",
    "remoteId",
    "inboxCursor",
    "outboxCursor",
    "mailboxDepths",
    "connection",
    "meta",
  ],
  InspectionDeadLetterPage: ["remoteName", "results", "nextCursor"],
} as const satisfies Record<string, readonly string[]>;

/**
 * The fields and arguments above that carry a reactor ORDINAL, by the GraphQL
 * type or mutation that declares them.
 *
 * Ordinals come from `IOperationIndex` and are bigint-origin: a long-lived
 * reactor's operation index passes 2^31 and keeps going. GraphQL's `Int` is a
 * signed 32-bit integer and REFUSES to serialize anything larger, so an
 * ordinal field typed `Int!` turns a healthy reactor's inspection read into a
 * serialization error the day its index crosses that line. Every one of these
 * is therefore `Float`, the same scalar the epoch-millisecond fields use and
 * for the same reason -- a double carries every integer up to 2^53 exactly --
 * and reactor-api's test pins that against the SDL.
 */
export const INSPECTION_ORDINAL_FIELDS = {
  InspectionProcessor: ["lastOrdinal"],
  InspectionCursor: ["cursorOrdinal", "liveAckOrdinal", "liveLatestOrdinal"],
  inspectionRewindInboxCursor: ["toOrdinal"],
} as const satisfies Record<string, readonly string[]>;
