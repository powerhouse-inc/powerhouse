import type {
  InspectorDriveInfo,
  InspectorProcessorInfo,
  Remote,
  RemoteCursorInfo,
  RemoteSyncInspection,
  WireDeadLetterPage,
  WireInspectorAttachmentInfo,
  WireInspectorDocumentModel,
  WireInspectorDrive,
  WireInspectorDriveIntegrity,
  WireInspectorDrivePage,
  WireInspectorProcessor,
  WireQueueState,
  WireRemoteCursor,
  WireRemoteSyncInspection,
  WireStorageHealth,
} from "@powerhousedao/reactor";
import { GraphQLError } from "graphql";
import type { Context } from "../types.js";
import type {
  IReactorInspectionSource,
  ReactorInspectionInfo,
} from "./source.js";

/**
 * Whether the caller has the host's policy-wide read standing. Supplied by the
 * subgraph as `IAuthorizationService.isSupremeAdmin(ctx.user?.address)`, and
 * taken as a parameter so these resolvers can be built (and tested) without a
 * subgraph, exactly as the reactor subgraph's resolvers are.
 */
export type InspectionAdminCheck = (ctx: Context) => boolean;

export type InspectionResolverOptions = {
  readonly isAdminCaller: InspectionAdminCheck;
};

function forbidden(what: string): GraphQLError {
  return new GraphQLError(`Reactor inspection requires admin access ${what}`, {
    extensions: { code: "FORBIDDEN" },
  });
}

function notEnabled(flag: string, what: string): GraphQLError {
  return new GraphQLError(
    `Reactor inspection ${what} is not enabled on this host: set ${flag}=true (or 1, yes, on) to serve it`,
    { extensions: { code: "FORBIDDEN" } },
  );
}

/**
 * An ordinal as the wire carries it. Ordinals are bigint-origin
 * (`IOperationIndex`) and the SDL serves them as `Float`, which graphql-js
 * refuses to serialize a `bigint` through -- so the coercion happens here,
 * once, rather than as a serialization error on a reactor whose index has
 * grown past what a `number` was handed back as.
 */
function toOrdinal(value: number | bigint): number {
  return Number(value);
}

function toWireDrive(drive: InspectorDriveInfo): WireInspectorDrive {
  return {
    driveId: drive.driveId,
    name: drive.name,
    branch: drive.branch,
    collectionId: drive.collectionId,
    documentType: drive.documentType,
    nodeCount: drive.nodeCount,
    fileCount: drive.fileCount,
    folderCount: drive.folderCount,
    icon: drive.icon ?? null,
  };
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

/**
 * Pairs each inspected remote with its configuration, so one query feeds both
 * a client's remote LIST and its inspection view. A remote that disappeared
 * between the inspection and this lookup is reported without meta rather than
 * failing the whole read.
 */
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

/**
 * Resolvers of the inspection subgraph (multi-reactor W3.2). Pure over the
 * source and the admin check, so the whole surface -- including its refusals --
 * is testable against an in-process reactor module with no HTTP server.
 *
 * The three access tiers are enforced here and nowhere else; see
 * {@link IReactorInspectionSource} for the posture they implement. `requireRead`
 * guards every read, `adminOp` wraps every state-changing op in the tier-2
 * check, and `requireSql` adds raw SQL's own tier on top of that.
 *
 * Every record served here is one of `@powerhousedao/reactor`'s inspection WIRE
 * types, which the remote client decodes from -- one contract, one definition,
 * pinned against this SDL by the subgraph test.
 */
export function createInspectionResolvers(
  source: IReactorInspectionSource,
  options: InspectionResolverOptions,
): Record<string, unknown> {
  const requireRead = (ctx: Context): void => {
    if (!options.isAdminCaller(ctx)) {
      throw forbidden("to read the reactor inspection surface");
    }
  };

  const requireAdmin = (ctx: Context, what: string): void => {
    requireRead(ctx);
    if (!source.adminEnabled) {
      throw notEnabled("PH_INSPECTION_ADMIN", what);
    }
  };

  const requireSql = (ctx: Context): void => {
    requireAdmin(ctx, "raw SQL");
    if (!source.sqlEnabled) {
      throw notEnabled("PH_INSPECTION_SQL", "raw SQL");
    }
  };

  /**
   * One state-changing field: the tier-2 check by the name of what it guards,
   * then the op. A factory rather than the check repeated in every resolver
   * body, so no mutation can be added that forgets it -- the gate and the
   * field are the same expression.
   */
  const adminOp = <Args, Result>(
    what: string,
    run: (args: Args) => Result,
  ): ((parent: unknown, args: Args, ctx: Context) => Result) => {
    return (_parent: unknown, args: Args, ctx: Context): Result => {
      requireAdmin(ctx, what);
      return run(args);
    };
  };

  const inspector = () => source.inspector;
  const sync = () => source.syncManager;

  /** Resolves `true` once the op it wraps has actually completed. */
  const done = async (op: Promise<void>): Promise<boolean> => {
    await op;
    return true;
  };

  return {
    Query: {
      // One parent for every read, so the tier-1 check runs once per request
      // and each field below resolves against an already-authorized source.
      inspection: (_parent: unknown, _args: unknown, ctx: Context) => {
        requireRead(ctx);
        return {};
      },
    },

    ReactorInspection: {
      info: (): ReactorInspectionInfo => source.info(),

      documentModels: async (): Promise<WireInspectorDocumentModel[]> =>
        inspector().listDocumentModels(),

      drives: async (
        _parent: unknown,
        args: { cursor?: string; limit?: number },
      ): Promise<WireInspectorDrivePage> => {
        const page = await inspector().listDrives(
          args.cursor ?? undefined,
          args.limit ?? undefined,
        );
        return {
          results: page.results.map(toWireDrive),
          nextCursor: page.nextCursor ?? null,
        };
      },

      driveIntegrity: async (
        _parent: unknown,
        args: { driveId: string; cursor?: string; limit?: number },
      ): Promise<WireInspectorDriveIntegrity> => {
        const result = await inspector().checkDriveIntegrity(
          args.driveId,
          args.cursor ?? undefined,
          args.limit ?? undefined,
        );
        return {
          driveId: result.driveId,
          checkedNodeCount: result.checkedNodeCount,
          totalFileNodeCount: result.totalFileNodeCount,
          missingDocuments: result.missingDocuments,
          unsupportedTypes: result.unsupportedTypes,
          nextCursor: result.nextCursor ?? null,
        };
      },

      attachmentInfo: async (): Promise<WireInspectorAttachmentInfo> => {
        const info = await inspector().getAttachmentInfo();
        return { ...info, lastError: info.lastError ?? null };
      },

      queueState: async (): Promise<WireQueueState> =>
        inspector().getQueueState(),

      processors: async (): Promise<WireInspectorProcessor[]> =>
        (await inspector().getProcessors()).map(toWireProcessor),

      catchUpStatus: () => inspector().getCatchUpStatus(),

      storageHealth: async (): Promise<WireStorageHealth> => {
        const health = await inspector().getStorageHealth();
        return {
          healthy: health.healthy,
          everRecreated: health.everRecreated,
          recreateCount: health.recreateCount,
          lastRecreated: health.lastRecreated ?? null,
        };
      },

      remotes: async (): Promise<WireRemoteSyncInspection[]> =>
        toWireRemotes(await sync().inspectRemotes(), sync().list()),

      remote: async (
        _parent: unknown,
        args: { remoteName: string },
      ): Promise<WireRemoteSyncInspection> => {
        const inspection = await sync().inspectRemote(args.remoteName);
        return toWireRemotes([inspection], sync().list())[0]!;
      },

      deadLetters: async (
        _parent: unknown,
        args: { remoteName: string; cursor?: string; limit?: number },
      ): Promise<WireDeadLetterPage> => {
        const page = await sync().listDeadLetters(
          args.remoteName,
          args.cursor,
          args.limit,
        );
        return {
          remoteName: page.remoteName,
          results: page.results,
          nextCursor: page.nextCursor ?? null,
        };
      },

      holds: (
        _parent: unknown,
        args: { remoteName?: string; documentId?: string },
      ) =>
        sync().listHolds({
          remoteName: args.remoteName ?? undefined,
          documentId: args.documentId ?? undefined,
        }),
    },

    Mutation: {
      // Each lever answers `true` only after the reactor's own op resolved:
      // the inspector REFUSES a lever its components cannot serve (a queue
      // that is not the inspectable one cannot be paused), and that refusal
      // has to reach the operator instead of becoming a cheerful `true`.
      inspectionPauseQueue: adminOp("pausing the queue", () =>
        done(inspector().pauseQueue()),
      ),

      inspectionResumeQueue: adminOp("resuming the queue", () =>
        done(inspector().resumeQueue()),
      ),

      inspectionRetryProcessor: adminOp(
        "retrying a processor",
        (args: { processorId: string }) =>
          done(inspector().retryProcessor(args.processorId)),
      ),

      inspectionSweepCatchUp: adminOp("sweeping catch-up", () =>
        inspector().sweepCatchUp(),
      ),

      inspectionValidateDocument: adminOp(
        "validating a document",
        (args: { documentId: string; branch?: string }) =>
          inspector().validateDocument(
            args.documentId,
            args.branch ?? undefined,
          ),
      ),

      inspectionRebuildKeyframes: adminOp(
        "rebuilding keyframes",
        (args: { documentId: string; branch?: string }) =>
          inspector().rebuildKeyframes(
            args.documentId,
            args.branch ?? undefined,
          ),
      ),

      inspectionRebuildSnapshots: adminOp(
        "rebuilding snapshots",
        (args: { documentId: string; branch?: string }) =>
          inspector().rebuildSnapshots(
            args.documentId,
            args.branch ?? undefined,
          ),
      ),

      inspectionTriggerPull: adminOp(
        "triggering a pull",
        (args: { remoteName: string }) => {
          sync().triggerPull(args.remoteName);
          return true;
        },
      ),

      inspectionRewindInboxCursor: adminOp(
        "rewinding an inbox cursor",
        (args: { remoteName: string; toOrdinal: number }) =>
          done(sync().rewindInboxCursor(args.remoteName, args.toOrdinal)),
      ),

      inspectionResetChannel: adminOp(
        "resetting a channel",
        (args: { remoteName: string }) =>
          done(sync().resetChannel(args.remoteName)),
      ),

      inspectionRequeueDeadLetter: adminOp(
        "requeueing a dead letter",
        (args: { remoteName: string; id: string }) =>
          done(sync().requeueDeadLetter(args.remoteName, args.id)),
      ),

      inspectionClearDeadLetter: adminOp(
        "clearing a dead letter",
        (args: { remoteName: string; id: string }) =>
          done(sync().clearDeadLetter(args.remoteName, args.id)),
      ),

      inspectionQueryDb: (
        _parent: unknown,
        args: { sql: string; params?: unknown[] },
        ctx: Context,
      ) => {
        requireSql(ctx);
        return source.dbQuery.queryDb(args.sql, args.params ?? undefined);
      },
    },
  };
}
