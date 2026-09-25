// Which workflow document a step is running for, available to services that
// sit below the coordinator. Attachment reads are authorized per document, and
// the block executor is shared across concurrent runs, so the scope travels
// with the async context rather than on the executor.
import type { IPieceWorker } from "../pieces/index.js";
import { AsyncLocalStorage } from "node:async_hooks";

export interface RunScope {
  workflowId: string;
  runId?: string | null;
  // The connections the definition this run pinned declared; a step resolves
  // nothing outside this set, and an edit mid-run never widens it.
  connections?: ReadonlySet<string>;
  // The worker child this run's piece steps go to, held for the length of the
  // run. Absent outside a pooled run, where the executor falls back to its own.
  pieceWorker?: IPieceWorker;
  // Journals the documents the reactor port hands this run's steps, before
  // they are handed over; absent where there is no journal to gate.
  recordDocuments?: (documentIds: string[]) => Promise<void>;
}

const storage = new AsyncLocalStorage<RunScope>();

export function withRunScope<T>(
  scope: RunScope,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(scope, fn);
}

export function currentWorkflowId(): string | undefined {
  return storage.getStore()?.workflowId;
}

export function currentRunId(): string | undefined {
  return storage.getStore()?.runId ?? undefined;
}

// Undefined outside a run, which the block executor treats as "resolve
// nothing": only a run establishes a binding.
export function currentBoundConnections(): ReadonlySet<string> | undefined {
  return storage.getStore()?.connections;
}

export function currentDocumentRecorder():
  | ((documentIds: string[]) => Promise<void>)
  | undefined {
  return storage.getStore()?.recordDocuments;
}

// The run's own worker, asked for per step rather than held by the executor:
// the executor is shared, and the child it should use is not.
export function currentPieceWorker(): IPieceWorker | undefined {
  return storage.getStore()?.pieceWorker;
}
