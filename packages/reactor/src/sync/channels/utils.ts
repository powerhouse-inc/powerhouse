import { JobHandle } from "../job-handle.js";
import type { SyncEnvelope } from "../types.js";

let jobCounter = 0;

/**
 * Converts a SyncEnvelope containing operations into a JobHandle.
 *
 * Extracts the necessary metadata from the envelope's operations to create
 * a job handle that can be processed by the receiving channel.
 *
 * @param envelope - The sync envelope containing operations
 * @param remoteName - The name of the remote this job is associated with
 * @returns A new JobHandle containing the envelope's operations
 * @throws Error if envelope has no operations or operations array is empty
 */
export function envelopeToJobHandle(
  envelope: SyncEnvelope,
  remoteName: string,
): JobHandle {
  if (!envelope.operations || envelope.operations.length === 0) {
    throw new Error("Cannot create JobHandle from envelope without operations");
  }

  const operations = envelope.operations;
  const firstOp = operations[0];
  const documentId = firstOp.context.documentId;
  const branch = firstOp.context.branch;
  const scopes = [...new Set(operations.map((op) => op.context.scope))];

  const jobId = `job-${envelope.channelMeta.id}-${Date.now()}-${jobCounter++}`;

  return new JobHandle(
    jobId,
    remoteName,
    documentId,
    scopes,
    branch,
    operations,
  );
}
