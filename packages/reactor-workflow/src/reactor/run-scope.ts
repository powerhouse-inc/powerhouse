// Which workflow document a step is running for, available to services that
// sit below the coordinator. Attachment reads are authorized per document, and
// the block executor is shared across concurrent runs, so the scope travels
// with the async context rather than on the executor.
import { AsyncLocalStorage } from "node:async_hooks";

export interface RunScope {
  workflowId: string;
  runId?: string | null;
}

const storage = new AsyncLocalStorage<RunScope>();

export function withRunScope<T>(scope: RunScope, fn: () => Promise<T>): Promise<T> {
  return storage.run(scope, fn);
}

export function currentWorkflowId(): string | undefined {
  return storage.getStore()?.workflowId;
}
