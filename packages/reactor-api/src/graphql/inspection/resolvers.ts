import type {
  INSPECTOR_OPS,
  InspectorDriveInfo,
  InspectorProcessorInfo,
  InspectorReadOpKey,
  Remote,
  RemoteCursorInfo,
  RemoteSyncInspection,
  SYNC_INSPECTION_OPS,
  SyncInspectionReadOpKey,
  ValidationResult,
  WireInspectorDrive,
  WireInspectorProcessor,
  WireRemoteCursor,
  WireRemoteSyncInspection,
  WireValidationResult,
} from "@powerhousedao/reactor";
import { GraphQLError } from "graphql";
import { ForbiddenError } from "../errors.js";

type GqlOf<T, K extends keyof T> = T[K] extends {
  readonly gql: infer G extends string;
}
  ? G
  : never;

/** Exactly the GraphQL fields of the read rows of both op tables. */
export type InspectionReadField =
  | GqlOf<typeof INSPECTOR_OPS, InspectorReadOpKey>
  | GqlOf<typeof SYNC_INSPECTION_OPS, SyncInspectionReadOpKey>;

export function operatorRequired(): GraphQLError {
  return new ForbiddenError("to read the reactor's operational state");
}

export function noSyncInspector(): GraphQLError {
  return new GraphQLError("This host does not serve sync inspection");
}

function toOrdinal(value: number | bigint): number {
  return Number(value);
}

export function toWireDrive(drive: InspectorDriveInfo): WireInspectorDrive {
  return { ...drive, icon: drive.icon ?? null };
}

export function toWireProcessor(
  info: InspectorProcessorInfo,
): WireInspectorProcessor {
  return {
    processorId: info.processorId,
    factoryId: info.factoryId,
    driveId: info.driveId,
    processorIndex: info.processorIndex,
    lastOrdinal: toOrdinal(info.lastOrdinal),
    status: info.status,
    lastError: info.lastError ?? null,
    lastErrorTimestampUtcMs: info.lastErrorTimestamp
      ? info.lastErrorTimestamp.getTime()
      : null,
  };
}

function toWireCursor(cursor: RemoteCursorInfo): WireRemoteCursor {
  return {
    cursorType: cursor.cursorType,
    cursorOrdinal: toOrdinal(cursor.cursorOrdinal),
    lastSyncedAtUtcMs: cursor.lastSyncedAtUtcMs ?? null,
    liveAckOrdinal: toOrdinal(cursor.liveAckOrdinal),
    liveLatestOrdinal: toOrdinal(cursor.liveLatestOrdinal),
  };
}

export function toWireRemotes(
  inspections: RemoteSyncInspection[],
  remotes: Remote[],
): WireRemoteSyncInspection[] {
  const byName = new Map(remotes.map((remote) => [remote.meta.name, remote]));
  return inspections.map((inspection) => ({
    remoteName: inspection.remoteName,
    remoteId: inspection.remoteId,
    inboxCursor: toWireCursor(inspection.inboxCursor),
    outboxCursor: toWireCursor(inspection.outboxCursor),
    mailboxDepths: inspection.mailboxDepths,
    connection: {
      snapshot: inspection.connection.snapshot,
      neverSucceeded: inspection.connection.neverSucceeded,
      stalenessMs: inspection.connection.stalenessMs ?? null,
    },
    meta: byName.get(inspection.remoteName)?.meta ?? {
      id: inspection.remoteId,
      name: inspection.remoteName,
    },
  }));
}

// Every issue names its scope; one the caller is not served is left out.
export function servedIssues(
  result: ValidationResult,
  scopes: ReadonlySet<string>,
): WireValidationResult {
  const keyframeIssues = result.keyframeIssues.filter((i) =>
    scopes.has(i.scope),
  );
  const snapshotIssues = result.snapshotIssues.filter((i) =>
    scopes.has(i.scope),
  );
  const streamOrderIssues = result.streamOrderIssues.filter((i) =>
    scopes.has(i.scope),
  );
  return {
    documentId: result.documentId,
    isConsistent:
      keyframeIssues.length === 0 &&
      snapshotIssues.length === 0 &&
      streamOrderIssues.length === 0,
    keyframeIssues,
    snapshotIssues,
    streamOrderIssues,
  };
}
