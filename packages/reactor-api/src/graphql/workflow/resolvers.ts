import type {
  RunRow,
  StepExecutionRow,
  WorkflowRuntimeService,
} from "@powerhousedao/reactor-workflow";
import { GraphQLError } from "graphql";
import type { IAuthorizationService } from "../../services/authorization.service.js";
import type { Context } from "../types.js";

interface FireArgs {
  workflowId: string;
  payload?: unknown;
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
    blockType: row.block_type,
    status: row.status,
    input: parseJson(row.input),
    output: parseJson(row.output),
    port: row.port,
    error: row.error,
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
      blockDescriptor: (_parent: unknown, args: { blockType: string }) =>
        runtime.blockDescriptor(args.blockType),
      blockOptions: (
        _parent: unknown,
        args: {
          blockType: string;
          propName: string;
          input?: unknown;
          connectionId?: string | null;
        },
        ctx: Context,
      ) =>
        runtime.blockOptions(
          args.blockType,
          args.propName,
          args.input,
          args.connectionId ?? undefined,
          ctx,
        ),
      pieceCatalog: () => runtime.pieceCatalog(),
      pieceActions: (_parent: unknown, args: { packageName: string }) =>
        runtime.pieceActions(args.packageName),
      pieceTriggers: (_parent: unknown, args: { packageName: string }) =>
        runtime.pieceTriggers(args.packageName),
      blockOutputTree: (
        _parent: unknown,
        args: { blockType: string; config?: unknown },
      ) => runtime.blockOutputTree(args.blockType, args.config),
      pieceDetail: (_parent: unknown, args: { packageName: string }) =>
        runtime.pieceDetail(args.packageName),
      searchBlocks: (
        _parent: unknown,
        args: { query: string; limit?: number | null },
      ) => runtime.searchBlocks(args.query, args.limit ?? undefined),
      connections: (_parent: unknown, _args: unknown, ctx: Context) =>
        runtime.connections(ctx),
      webhookEndpoint: (
        _parent: unknown,
        args: { workflowId: string },
        ctx: Context,
      ) => runtime.webhookEndpoint(args.workflowId, ctx),
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
          blockType: row.block_type,
          status: row.status,
          intervalMs: row.interval_ms,
          nextPollAt: row.next_poll_at,
          lastPollAt: row.last_poll_at,
          lastError: row.last_error,
          consecutiveFailures: row.consecutive_failures,
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
        args: { workflowId: string },
        ctx: Context,
      ) => runtime.testTrigger(args.workflowId, ctx),
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
