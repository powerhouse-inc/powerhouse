import {
  DriveInspection,
  type INSPECTOR_OPS,
  type InspectorDocumentReader,
  type InspectorDriveInfo,
  type InspectorProcessorInfo,
  type InspectorReadOpKey,
  type ISyncInspector,
  type Remote,
  type RemoteCursorInfo,
  type RemoteSyncInspection,
  type SYNC_INSPECTION_OPS,
  type SyncInspectionReadOpKey,
  type ValidationResult,
  type WireDeadLetterPage,
  type WireInspectorAttachmentInfo,
  type WireInspectorDocumentModel,
  type WireInspectorDrive,
  type WireInspectorDriveIntegrity,
  type WireInspectorDrivePage,
  type WireInspectorProcessor,
  type WireQueueState,
  type WireReactorInfo,
  type WireRemoteCursor,
  type WireRemoteSyncInspection,
  type WireStorageHealth,
  type WireValidationResult,
} from "@powerhousedao/reactor";
import { GraphQLError } from "graphql";
import { ForbiddenError } from "../errors.js";
import type { Context } from "../types.js";
import type { IReactorInspectionSource } from "./source.js";

/** How the subgraph decides for one request's caller. */
export interface InspectionCallerGate {
  /** One of the host's listed admins, whatever the policy. */
  isOperator(ctx: Context): boolean;
  /** The reactor client, reading as the caller. */
  readerFor(ctx: Context): InspectorDocumentReader;
  /** The host's own read check on one document; throws when refused. */
  assertCanRead(identifier: string, ctx: Context): Promise<string>;
  /** The host's own read check over a listing. */
  readableIds(ids: readonly string[], ctx: Context): Promise<Set<string>>;
  /** The document's id and the scopes the caller is served, or undefined. */
  servedDocument(
    identifier: string,
    branch: string | undefined,
    ctx: Context,
  ): Promise<{ id: string; scopes: ReadonlySet<string> } | undefined>;
}

type GqlOf<T, K extends keyof T> = T[K] extends {
  readonly gql: infer G extends string;
}
  ? G
  : never;

/** Exactly the GraphQL fields of the read rows of both op tables. */
export type InspectionReadField =
  | GqlOf<typeof INSPECTOR_OPS, InspectorReadOpKey>
  | GqlOf<typeof SYNC_INSPECTION_OPS, SyncInspectionReadOpKey>;

type FieldResolver = (parent: unknown, args: never, ctx: Context) => unknown;

function operatorRequired(): GraphQLError {
  return new ForbiddenError("to read the reactor's operational state");
}

function noSyncInspector(): GraphQLError {
  return new GraphQLError("This host does not serve sync inspection");
}

function toOrdinal(value: number | bigint): number {
  return Number(value);
}

function toWireDrive(drive: InspectorDriveInfo): WireInspectorDrive {
  return { ...drive, icon: drive.icon ?? null };
}

function toWireProcessor(info: InspectorProcessorInfo): WireInspectorProcessor {
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

function toWireRemotes(
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
function servedIssues(
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

/** The read half of the inspection surface; no lever has a field here. */
export function createInspectionResolvers(
  source: IReactorInspectionSource,
  sync: { list(): Remote[] },
  gate: InspectionCallerGate,
): Record<string, unknown> {
  const inspector = source.inspector;

  const operator =
    <A, R>(run: (args: A) => R) =>
    (_parent: unknown, args: A, ctx: Context): R => {
      if (!gate.isOperator(ctx)) {
        throw operatorRequired();
      }
      return run(args);
    };

  const syncInspector = (): ISyncInspector => {
    if (!source.syncInspector) {
      throw noSyncInspector();
    }
    return source.syncInspector;
  };

  const drivesFor = (ctx: Context) =>
    new DriveInspection(gate.readerFor(ctx), source.documentModelRegistry);

  const fields: Record<InspectionReadField, FieldResolver> = {
    info: async (
      _parent: unknown,
      _args: unknown,
      ctx: Context,
    ): Promise<WireReactorInfo> => {
      const info = await inspector.info();
      return { ...info, access: gate.isOperator(ctx) ? info.access : null };
    },

    documentModels: (): Promise<WireInspectorDocumentModel[]> =>
      inspector.listDocumentModels(),

    drives: async (
      _parent: unknown,
      args: { cursor?: string | null; limit?: number | null },
      ctx: Context,
    ): Promise<WireInspectorDrivePage> => {
      const page = await drivesFor(ctx).listDrives(
        args.cursor ?? undefined,
        args.limit ?? undefined,
      );
      const readable = await gate.readableIds(
        page.results.map((drive) => drive.driveId),
        ctx,
      );
      return {
        results: page.results
          .filter((drive) => readable.has(drive.driveId))
          .map(toWireDrive),
        nextCursor: page.nextCursor ?? null,
      };
    },

    driveIntegrity: async (
      _parent: unknown,
      args: { driveId: string; branch: string },
      ctx: Context,
    ): Promise<WireInspectorDriveIntegrity> => {
      const identifier = await gate.assertCanRead(args.driveId, ctx);
      const served = await gate.servedDocument(identifier, args.branch, ctx);
      if (!served) {
        throw new ForbiddenError("to read this document");
      }
      return drivesFor(ctx).checkDriveIntegrity(served.id, args.branch);
    },

    attachmentInfo: operator(async (): Promise<WireInspectorAttachmentInfo> => {
      const info = await inspector.getAttachmentInfo();
      return { ...info, lastError: info.lastError ?? null };
    }),

    queueState: operator((): Promise<WireQueueState> =>
      inspector.getQueueState(),
    ),

    processors: operator(async (): Promise<WireInspectorProcessor[]> =>
      (await inspector.getProcessors()).map(toWireProcessor),
    ),

    catchUpStatus: operator(() => inspector.getCatchUpStatus()),

    storageHealth: operator((): Promise<WireStorageHealth> =>
      inspector.getStorageHealth(),
    ),

    validateDocument: async (
      _parent: unknown,
      args: { documentId: string; branch?: string | null },
      ctx: Context,
    ): Promise<WireValidationResult> => {
      const branch = args.branch ?? undefined;
      const identifier = await gate.assertCanRead(args.documentId, ctx);
      const served = await gate.servedDocument(identifier, branch, ctx);
      if (!served) {
        throw new ForbiddenError("to read this document");
      }
      const result = await inspector.validateDocument(served.id, branch);
      return servedIssues(result, served.scopes);
    },

    remotes: operator(async (): Promise<WireRemoteSyncInspection[]> =>
      toWireRemotes(await syncInspector().inspectRemotes(), sync.list()),
    ),

    remote: operator(
      async (args: {
        remoteName: string;
      }): Promise<WireRemoteSyncInspection> => {
        const inspection = await syncInspector().inspectRemote(args.remoteName);
        return toWireRemotes([inspection], sync.list())[0];
      },
    ),

    deadLetters: operator(
      async (args: {
        remoteName: string;
        cursor?: string | null;
        limit?: number | null;
      }): Promise<WireDeadLetterPage> => {
        const page = await syncInspector().listDeadLetters(
          args.remoteName,
          args.cursor ?? undefined,
          args.limit ?? undefined,
        );
        return {
          remoteName: page.remoteName,
          results: page.results,
          nextCursor: page.nextCursor ?? null,
        };
      },
    ),
  };

  return {
    Query: {
      inspection: () => ({}),
    },
    ReactorInspection: fields,
  };
}
