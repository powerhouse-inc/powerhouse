// Adapts the run journal's `piece_store` table to the engine's PieceStorePort,
// so an action's `ctx.store` is durable the moment the piece writes it.

// Which workflow a step belongs to travels on the run scope, not the executor,
// which concurrent runs share.
import type { PieceStorePort } from "@powerhousedao/reactor-connectors";
import type { WorkflowRunStore } from "./store.js";

// FLOW is the only scope with an identity today. A piece asking for PROJECT
// gets a `PROJECT:`-prefixed key inside the same partition (see store.ts).
const SCOPE = "FLOW";

export function createPieceStorePort(
  store: WorkflowRunStore,
  workflowIdFor: () => string | undefined,
): PieceStorePort {
  // A step with no workflow in scope must fail rather than read or write
  // another workflow's keys.
  const scopeKey = () => {
    const workflowId = workflowIdFor();
    if (!workflowId) {
      throw new Error("ctx.store is unavailable: no workflow is in scope");
    }
    return workflowId;
  };

  return {
    get: (key) => store.getPieceStoreValue(SCOPE, scopeKey(), key),
    put: (key, value) =>
      store.setPieceStoreValue(SCOPE, scopeKey(), key, value),
    delete: (key) => store.deletePieceStoreValue(SCOPE, scopeKey(), key),
  };
}
