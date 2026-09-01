import { type BaseSubgraph } from "@powerhousedao/reactor-api";
import { workflowRuntime } from "./service.js";
import type { RunRow, StepExecutionRow } from "./store.js";

interface FireArgs {
  workflowId: string;
  payload?: unknown;
}

interface RunsArgs {
  workflowId?: string;
  limit?: number;
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
      runs: async (_parent: unknown, args: RunsArgs) => {
        const store = await workflowRuntime.store();
        if (!store) return [];
        const rows = await store.listRuns(args.workflowId, args.limit ?? 25);
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
    },
  };
};
