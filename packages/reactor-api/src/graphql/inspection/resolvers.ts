import type {
  DeadLetterPage,
  InspectorProcessorInfo,
  QueueStateSnapshot,
  Remote,
  RemoteSyncInspection,
  StorageHealth,
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

/** The wire shape of {@link InspectorProcessorInfo}: a Date cannot cross JSON. */
type WireProcessor = {
  processorId: string;
  factoryId: string;
  driveId: string;
  processorIndex: number;
  lastOrdinal: number;
  status: string;
  lastError: string | null;
  lastErrorTimestampUtcMs: number | null;
};

/** One remote's inspection plus the remote's configuration, in one record. */
type WireRemote = RemoteSyncInspection & { meta: Remote["meta"] };

function forbidden(what: string): GraphQLError {
  return new GraphQLError(`Reactor inspection requires admin access ${what}`, {
    extensions: { code: "FORBIDDEN" },
  });
}

function notEnabled(flag: string, what: string): GraphQLError {
  return new GraphQLError(
    `Reactor inspection ${what} is not enabled on this host: set ${flag}=true to serve it`,
    { extensions: { code: "FORBIDDEN" } },
  );
}

function toWireProcessor(info: InspectorProcessorInfo): WireProcessor {
  return {
    processorId: info.processorId,
    factoryId: info.factoryId,
    driveId: info.driveId,
    processorIndex: info.processorIndex,
    lastOrdinal: info.lastOrdinal,
    status: info.status,
    lastError: info.lastError ?? null,
    lastErrorTimestampUtcMs: info.lastErrorTimestamp
      ? info.lastErrorTimestamp.getTime()
      : null,
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
): WireRemote[] {
  const byName = new Map(remotes.map((remote) => [remote.meta.name, remote]));
  return inspections.map((inspection) => ({
    ...inspection,
    meta: byName.get(inspection.remoteName)?.meta ?? {
      id: inspection.remoteId,
      name: inspection.remoteName,
    },
  })) as WireRemote[];
}

/**
 * Resolvers of the inspection subgraph (multi-reactor W3.2). Pure over the
 * source and the admin check, so the whole surface -- including its refusals --
 * is testable against an in-process reactor module with no HTTP server.
 *
 * The three access tiers are enforced here and nowhere else; see
 * {@link IReactorInspectionSource} for the posture they implement. `requireRead`
 * guards every read, `requireAdmin` every state-changing op, and `requireSql`
 * raw SQL on top of that.
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

  const inspector = () => source.inspector;
  const sync = () => source.syncManager;

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

      queueState: async (): Promise<QueueStateSnapshot> =>
        inspector().getQueueState(),

      processors: async (): Promise<WireProcessor[]> =>
        (await inspector().getProcessors()).map(toWireProcessor),

      catchUpStatus: () => inspector().getCatchUpStatus(),

      storageHealth: async (): Promise<StorageHealth> =>
        inspector().getStorageHealth(),

      remotes: async (): Promise<WireRemote[]> =>
        toWireRemotes(await sync().inspectRemotes(), sync().list()),

      remote: async (
        _parent: unknown,
        args: { remoteName: string },
      ): Promise<WireRemote> => {
        const inspection = await sync().inspectRemote(args.remoteName);
        return toWireRemotes([inspection], sync().list())[0];
      },

      deadLetters: (
        _parent: unknown,
        args: { remoteName: string; cursor?: string; limit?: number },
      ): Promise<DeadLetterPage> =>
        sync().listDeadLetters(args.remoteName, args.cursor, args.limit),

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
      inspectionPauseQueue: async (
        _parent: unknown,
        _args: unknown,
        ctx: Context,
      ) => {
        requireAdmin(ctx, "pausing the queue");
        await inspector().pauseQueue();
        return true;
      },

      inspectionResumeQueue: async (
        _parent: unknown,
        _args: unknown,
        ctx: Context,
      ) => {
        requireAdmin(ctx, "resuming the queue");
        await inspector().resumeQueue();
        return true;
      },

      inspectionRetryProcessor: async (
        _parent: unknown,
        args: { processorId: string },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "retrying a processor");
        await inspector().retryProcessor(args.processorId);
        return true;
      },

      inspectionSweepCatchUp: (
        _parent: unknown,
        _args: unknown,
        ctx: Context,
      ) => {
        requireAdmin(ctx, "sweeping catch-up");
        return inspector().sweepCatchUp();
      },

      inspectionValidateDocument: (
        _parent: unknown,
        args: { documentId: string; branch?: string },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "validating a document");
        return inspector().validateDocument(
          args.documentId,
          args.branch ?? undefined,
        );
      },

      inspectionRebuildKeyframes: (
        _parent: unknown,
        args: { documentId: string; branch?: string },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "rebuilding keyframes");
        return inspector().rebuildKeyframes(
          args.documentId,
          args.branch ?? undefined,
        );
      },

      inspectionRebuildSnapshots: (
        _parent: unknown,
        args: { documentId: string; branch?: string },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "rebuilding snapshots");
        return inspector().rebuildSnapshots(
          args.documentId,
          args.branch ?? undefined,
        );
      },

      inspectionTriggerPull: (
        _parent: unknown,
        args: { remoteName: string },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "triggering a pull");
        sync().triggerPull(args.remoteName);
        return true;
      },

      inspectionRewindInboxCursor: async (
        _parent: unknown,
        args: { remoteName: string; toOrdinal: number },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "rewinding an inbox cursor");
        await sync().rewindInboxCursor(args.remoteName, args.toOrdinal);
        return true;
      },

      inspectionResetChannel: async (
        _parent: unknown,
        args: { remoteName: string },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "resetting a channel");
        await sync().resetChannel(args.remoteName);
        return true;
      },

      inspectionRequeueDeadLetter: async (
        _parent: unknown,
        args: { remoteName: string; id: string },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "requeueing a dead letter");
        await sync().requeueDeadLetter(args.remoteName, args.id);
        return true;
      },

      inspectionClearDeadLetter: async (
        _parent: unknown,
        args: { remoteName: string; id: string },
        ctx: Context,
      ) => {
        requireAdmin(ctx, "clearing a dead letter");
        await sync().clearDeadLetter(args.remoteName, args.id);
        return true;
      },

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
