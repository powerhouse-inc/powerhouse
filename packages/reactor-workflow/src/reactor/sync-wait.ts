// A workflow created elsewhere can be asked about before it syncs here.
import type { IReactorClient } from "@powerhousedao/reactor";

export const SYNC_WAIT_MS = 10_000;
const SYNC_POLL_MS = 200;

export const WORKFLOW_SYNCING_MESSAGE =
  "Workflow is still syncing; try again in a moment";

// Retryable: the document has not reached this reactor yet.
export class WorkflowSyncingError extends Error {
  readonly code = "WORKFLOW_SYNCING";
  readonly retryable = true;

  constructor() {
    super(WORKFLOW_SYNCING_MESSAGE);
    this.name = "WorkflowSyncingError";
  }
}

export interface WorkflowAccessOptions {
  // The drive the caller opened the workflow from; lets a call wait for sync.
  driveId?: string;
}

// No stream under the id yet. A deleted document keeps its stream, so it
// never reads as on its way.
export async function isNotHereYet(
  client: Pick<IReactorClient, "isDocumentIdTaken">,
  documentId: string,
): Promise<boolean> {
  try {
    return !(await client.isDocumentIdTaken(documentId));
  } catch {
    return false;
  }
}

// Retries `check` until it passes or `timeoutMs` ends, polling while the
// document is absent. Throws WorkflowSyncingError if it never arrived.
export async function waitForSync(
  client: Pick<IReactorClient, "isDocumentIdTaken">,
  documentId: string,
  check: () => Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let denied: unknown;
  let arrived = false;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SYNC_POLL_MS));
    if (await isNotHereYet(client, documentId)) continue;
    arrived = true;
    try {
      await check();
      return;
    } catch (error) {
      denied = error;
    }
  }
  if (!arrived) throw new WorkflowSyncingError();
  throw denied;
}
