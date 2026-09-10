import { type BaseSubgraph } from "@powerhousedao/reactor-api";
import { searchBlocks } from "./block-search.js";
import {
  fetchPieceActions,
  fetchPieceCatalog,
  fetchPieceDetail,
  fetchPieceTriggers,
} from "./piece-catalog.js";
import { workflowRuntime } from "./service.js";
import type { RunRow, StepExecutionRow } from "./store.js";

interface FireArgs {
  workflowId: string;
  payload?: unknown;
}

interface RunsArgs {
  workflowId?: string;
  driveId?: string;
  limit?: number;
}

// Prod gate until runtime auth lands: writes are refused unless opted in.
function assertSecretWritesAllowed(): void {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.PH_SECRETS_ALLOW_WRITE !== "true"
  ) {
    throw new Error(
      "Secret writes are disabled; set PH_SECRETS_ALLOW_WRITE=true on the switchboard",
    );
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
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  workflowRuntime.configure(subgraph);

  return {
    Query: {
      workflowRuntime: () => ({}),
    },
    WorkflowRuntimeQueries: {
      health: () => "ok",
      blockDescriptor: (_parent: unknown, args: { blockType: string }) =>
        workflowRuntime.blockDescriptor(args.blockType),
      blockOptions: (
        _parent: unknown,
        args: {
          blockType: string;
          propName: string;
          input?: unknown;
          connectionId?: string | null;
        },
      ) =>
        workflowRuntime.blockOptions(
          args.blockType,
          args.propName,
          args.input,
          args.connectionId ?? undefined,
        ),
      pieceCatalog: () => fetchPieceCatalog(),
      pieceActions: (_parent: unknown, args: { packageName: string }) =>
        fetchPieceActions(args.packageName),
      pieceTriggers: (_parent: unknown, args: { packageName: string }) =>
        fetchPieceTriggers(args.packageName),
      blockOutputTree: (
        _parent: unknown,
        args: { blockType: string; config?: unknown },
      ) => workflowRuntime.blockOutputTree(args.blockType, args.config),
      pieceDetail: (_parent: unknown, args: { packageName: string }) =>
        fetchPieceDetail(args.packageName),
      searchBlocks: (
        _parent: unknown,
        args: { query: string; limit?: number | null },
      ) => searchBlocks(args.query, args.limit ?? undefined),
      connections: () => workflowRuntime.connections(),
      webhookEndpoint: (_parent: unknown, args: { workflowId: string }) =>
        workflowRuntime.webhookEndpoint(args.workflowId),
      secret: async (_parent: unknown, args: { ref: string }) => {
        try {
          return await (await workflowRuntime.secrets()).stat(args.ref);
        } catch {
          // Unknown or malformed ref reads as "no such secret".
          return null;
        }
      },
      secrets: async () => (await workflowRuntime.secrets()).list(),
      triggerStates: async () =>
        (await workflowRuntime.triggerStates()).map((row) => ({
          workflowId: row.workflow_id,
          blockType: row.block_type,
          status: row.status,
          intervalMs: row.interval_ms,
          nextPollAt: row.next_poll_at,
          lastPollAt: row.last_poll_at,
          lastError: row.last_error,
          consecutiveFailures: row.consecutive_failures,
        })),
      runs: async (_parent: unknown, args: RunsArgs) => {
        const store = await workflowRuntime.store();
        if (!store) return [];
        // A drive scopes runs to the workflows it holds; an explicit
        // workflowId is narrower still, so it wins.
        const scope =
          args.workflowId ??
          (args.driveId
            ? await workflowRuntime.driveWorkflowIds(args.driveId)
            : undefined);
        const rows = await store.listRuns(scope, args.limit ?? 25);
        return Promise.all(
          rows.map(async (row) =>
            toRunRecord(row, await store.getSteps(row.id)),
          ),
        );
      },
      run: async (_parent: unknown, args: { id: string }) => {
        const store = await workflowRuntime.store();
        if (!store) return null;
        const row = await store.getRun(args.id);
        if (!row) return null;
        return toRunRecord(row, await store.getSteps(row.id));
      },
    },
    Mutation: {
      workflowRuntime: () => ({}),
    },
    WorkflowRuntimeMutations: {
      fire: (_parent: unknown, args: FireArgs) =>
        workflowRuntime.fire(args.workflowId, args.payload),
      testTrigger: (_parent: unknown, args: { workflowId: string }) =>
        workflowRuntime.testTrigger(args.workflowId),
      rerun: (_parent: unknown, args: { runId: string }) =>
        workflowRuntime.rerun(args.runId),
      createSecret: async (
        _parent: unknown,
        args: { value: string; label?: string | null },
      ) => {
        assertSecretWritesAllowed();
        return (await workflowRuntime.secrets()).create({
          value: args.value,
          label: args.label ?? undefined,
        });
      },
      rotateSecret: async (
        _parent: unknown,
        args: { ref: string; value: string },
      ) => {
        assertSecretWritesAllowed();
        return (await workflowRuntime.secrets()).rotate(args.ref, args.value);
      },
      deleteSecret: async (_parent: unknown, args: { ref: string }) => {
        assertSecretWritesAllowed();
        await (await workflowRuntime.secrets()).delete(args.ref);
        return true;
      },
      checkConnection: (_parent: unknown, args: { connectionId: string }) =>
        workflowRuntime.checkConnection(args.connectionId),
    },
  };
};
