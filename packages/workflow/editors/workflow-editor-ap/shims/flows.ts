// Shim for @/features/flows — the write seam: flowsApi.update hands each
// FlowOperationRequest to a bridge that dispatches document actions.
import type {
  FlowOperationRequest,
  PopulatedFlow,
} from "../vendor/shared/index.js";

export interface FlowsApiBridge {
  update: (operation: FlowOperationRequest) => Promise<PopulatedFlow>;
  get: () => Promise<PopulatedFlow>;
}

let bridge: FlowsApiBridge | null = null;

export function setFlowsApiBridge(next: FlowsApiBridge | null): void {
  bridge = next;
}

function requireBridge(): FlowsApiBridge {
  if (!bridge) throw new Error("Workflow document bridge is not registered");
  return bridge;
}

export const flowsApi = {
  update(
    _flowId: string,
    operation: FlowOperationRequest,
    _minimal?: boolean,
  ): Promise<PopulatedFlow> {
    return requireBridge().update(operation);
  },
  get(_flowId: string): Promise<PopulatedFlow> {
    return requireBridge().get();
  },
};

export const sampleDataHooks = {
  invalidateSampleData: (
    _flowVersionId: string,
    _queryClient: unknown,
  ): void => {},
};
