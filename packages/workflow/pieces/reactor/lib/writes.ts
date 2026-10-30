// A write half's handle as a step takes it: the step fails when the job
// failed, or any of its actions erred or was denied.
import {
  assertActionsApplied,
  ReactorJobFailedError,
  type ReactorWriteClient,
} from "@powerhousedao/pieces-framework";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";

export type WriteHandle = Awaited<ReturnType<ReactorWriteClient["execute"]>>;
export type WriteReceipt = Awaited<WriteHandle["readable"]>;

function named(name: string, message: string, cause?: unknown): Error {
  const error = new Error(message, cause === undefined ? {} : { cause });
  error.name = name;
  return error;
}

// The receipt once readable. A reducer error is on the receipt, not thrown.
export async function applied(
  handle: WriteHandle,
  actions?: readonly Action[],
): Promise<WriteReceipt> {
  let receipt: WriteReceipt;
  try {
    receipt = await handle.readable;
  } catch (error) {
    if (error instanceof Error && error.name === "JobFailedError") {
      throw named(
        ReactorJobFailedError,
        `Reactor job ${handle.jobId} failed: ${error.message}`,
        error,
      );
    }
    throw error;
  }
  assertActionsApplied(receipt.job, actions);
  return receipt;
}

// The written document, read back once every action applied.
export async function appliedDocument(
  handle: WriteHandle,
  actions?: readonly Action[],
): Promise<PHDocument> {
  await applied(handle, actions);
  return handle.document();
}
