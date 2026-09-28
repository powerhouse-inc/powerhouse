import type {
  Context,
  IAuthorizationService,
} from "@powerhousedao/reactor-api";
import type {
  RunRow,
  StepExecutionRow,
  WorkflowRuntimeService,
} from "@powerhousedao/reactor-workflow";
import { GraphQLError } from "graphql";

interface FireArgs {
  workflowId: string;
  payload?: unknown;
}

interface PieceArgs {
  packageName: string;
  version?: string | null;
}

type BlockRef = Parameters<WorkflowRuntimeService["blockDescriptor"]>[0];

interface BlockInput {
  pieceName: string;
  pieceVersion: string;
  name: string;
  kind: string;
}

function blockRef(input: BlockInput): BlockRef {
  if (input.kind !== "action" && input.kind !== "trigger") {
    throw new GraphQLError(
      `A block's kind is "action" or "trigger", got "${input.kind}"`,
    );
  }
  return {
    pieceName: input.pieceName,
    pieceVersion: input.pieceVersion,
    name: input.name,
    kind: input.kind,
  };
}

interface RunsArgs {
  workflowId?: string;
  driveId?: string;
  limit?: number;
}

// A secret belongs to the reactor, not to any one document, so writing one is
// an administrator's call — the gate the package mutations already use.
function requireAdmin(
  authorizationService: IAuthorizationService,
  ctx: Context,
): void {
  if (!authorizationService.isSupremeAdmin(ctx.user?.address)) {
    throw new GraphQLError("Admin access required");
  }
}

// The runtime's retryable "not synced here yet", tagged for clients.
async function syncAware<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof Error && error.name === "WorkflowSyncingError") {
      throw new GraphQLError(error.message, {
        extensions: { code: "WORKFLOW_SYNCING", retryable: true },
      });
    }
    throw error;
  }
}

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function toStepRecord(row: StepExecutionRow) {
  return {
    stepId: row.step_id,
    stepKey: row.step_key,
    pieceName: row.piece_name,
    blockName: row.block_name,
    status: row.status,
    input: parseJson(row.input),
    output: parseJson(row.output),
    port: row.port,
    error: row.error,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    pieceVersion: row.piece_version,
    pieceSource: row.piece_source,
    versionMatch: row.version_match,
    versionNote: row.version_note,
  };
}

function toRunRecord(row: RunRow, steps: StepExecutionRow[]) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    workflowVersion: row.workflow_version,
    triggerKind: row.trigger_kind,
    triggerPayload: parseJson(row.trigger_payload),
    status: row.status,
    error: row.error,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    rerunOf: row.rerun_of,
    warnings: row.warnings,
    warningNotes: parseJson(row.warning_notes) ?? [],
    steps: steps.map(toStepRecord),
  };
}

export const getResolvers = (
  runtime: WorkflowRuntimeService,
  authorizationService: IAuthorizationService,
): Record<string, unknown> => {
  return {
    Query: {
      workflowRuntime: () => ({}),
    },
    WorkflowRuntimeQueries: {
      health: () => "ok",
      blockDescriptor: (_parent: unknown, args: { block: BlockInput }) =>
        runtime.blockDescriptor(blockRef(args.block)),
      blockOptions: (
        _parent: unknown,
        args: {
          block: BlockInput;
          propName: string;
          input?: unknown;
          connectionId?: string | null;
          searchValue?: string | null;
        },
        ctx: Context,
      ) =>
        runtime.blockOptions(
          blockRef(args.block),
          args.propName,
          args.input,
          args.connectionId ?? undefined,
          ctx,
          args.searchValue ?? undefined,
        ),
      pieceCatalog: () => runtime.pieceCatalog(),
      pieceActions: (_parent: unknown, args: PieceArgs) =>
        runtime.pieceActions(args.packageName, args.version ?? undefined),
      pieceTriggers: (_parent: unknown, args: PieceArgs) =>
        runtime.pieceTriggers(args.packageName, args.version ?? undefined),
      blockOutputTree: (
        _parent: unknown,
        args: { block: BlockInput; config?: unknown },
      ) => runtime.blockOutputTree(blockRef(args.block), args.config),
      stepOutputTree: (
        _parent: unknown,
        args: { workflowId: string; stepId: string },
        ctx: Context,
      ) => runtime.stepOutputTree(args.workflowId, args.stepId, ctx),
      blockResolutions: (
        _parent: unknown,
        args: { workflowId: string },
        ctx: Context,
      ) => runtime.blockResolutions(args.workflowId, ctx),
      pieceDetail: (_parent: unknown, args: PieceArgs) =>
        runtime.pieceDetail(args.packageName, args.version ?? undefined),
      searchBlocks: (
        _parent: unknown,
        args: { query: string; limit?: number | null },
      ) => runtime.searchBlocks(args.query, args.limit ?? undefined),
      connections: (_parent: unknown, _args: unknown, ctx: Context) =>
        runtime.connections(ctx),
      webhookEndpoint: (
        _parent: unknown,
        args: { workflowId: string; driveId?: string | null },
        ctx: Context,
      ) =>
        syncAware(() =>
          runtime.webhookEndpoint(args.workflowId, ctx, {
            driveId: args.driveId ?? undefined,
          }),
        ),
      secret: async (_parent: unknown, args: { ref: string }) => {
        try {
          return await (await runtime.secrets()).stat(args.ref);
        } catch {
          // Unknown or malformed ref reads as "no such secret".
          return null;
        }
      },
      secrets: async () => (await runtime.secrets()).list(),
      triggerStates: async (_parent: unknown, _args: unknown, ctx: Context) =>
        (await runtime.triggerStates(ctx)).map((row) => ({
          workflowId: row.workflow_id,
          pieceName: row.piece_name,
          triggerName: row.trigger_name,
          status: row.status,
          intervalMs: row.interval_ms,
          nextPollAt: row.next_poll_at,
          lastPollAt: row.last_poll_at,
          lastError: row.last_error,
          consecutiveFailures: row.consecutive_failures,
          pieceVersion: row.piece_version,
          pieceSource: row.piece_source,
          versionMatch: row.version_match,
          versionNote: row.version_note,
        })),
      runs: async (_parent: unknown, args: RunsArgs, ctx: Context) =>
        (await runtime.runs(args, ctx)).map((record) =>
          toRunRecord(record.row, record.steps),
        ),
      run: async (_parent: unknown, args: { id: string }, ctx: Context) => {
        const record = await runtime.run(args.id, ctx);
        return record ? toRunRecord(record.row, record.steps) : null;
      },
    },
    Mutation: {
      workflowRuntime: () => ({}),
    },
    WorkflowRuntimeMutations: {
      fire: (_parent: unknown, args: FireArgs, ctx: Context) =>
        runtime.fire(args.workflowId, args.payload, "manual", undefined, ctx),
      testTrigger: (
        _parent: unknown,
        args: {
          workflowId: string;
          payload?: unknown;
          timeoutSeconds?: number | null;
          driveId?: string | null;
        },
        ctx: Context,
      ) =>
        syncAware(() =>
          runtime.testTrigger(args.workflowId, ctx, {
            ...(args.payload !== undefined ? { payload: args.payload } : {}),
            ...(typeof args.timeoutSeconds === "number"
              ? { timeoutMs: args.timeoutSeconds * 1000 }
              : {}),
            driveId: args.driveId ?? undefined,
          }),
        ),
      cancelTriggerTest: (
        _parent: unknown,
        args: { workflowId: string },
        ctx: Context,
      ) => runtime.cancelTriggerTestFor(args.workflowId, ctx),
      testStep: (
        _parent: unknown,
        args: { workflowId: string; stepId: string; driveId?: string | null },
        ctx: Context,
      ) =>
        syncAware(() =>
          runtime.testStep(args.workflowId, args.stepId, ctx, {
            driveId: args.driveId ?? undefined,
          }),
        ),
      rerun: (_parent: unknown, args: { runId: string }, ctx: Context) =>
        runtime.rerun(args.runId, ctx),
      createSecret: async (
        _parent: unknown,
        args: { value: string; label?: string | null },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        return (await runtime.secrets()).create({
          value: args.value,
          label: args.label ?? undefined,
        });
      },
      rotateSecret: async (
        _parent: unknown,
        args: { ref: string; value: string },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        return (await runtime.secrets()).rotate(args.ref, args.value);
      },
      deleteSecret: async (
        _parent: unknown,
        args: { ref: string },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        await (await runtime.secrets()).delete(args.ref);
        return true;
      },
      checkConnection: (
        _parent: unknown,
        args: { connectionId: string },
        ctx: Context,
      ) => runtime.checkConnection(args.connectionId, ctx),
    },
  };
};
