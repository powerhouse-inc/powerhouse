import type {
  Action,
  ActionSigningTarget,
  ISigner,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  actionSignerIdentity,
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";

/** Submitted types whose stored action the reducer writes in their place. */
const SYNTHESIZING_TYPES: ReadonlySet<string> = new Set([
  "UNDO",
  "REDO",
  "PRUNE",
]);

/**
 * Whether `operation` stores an action the reducer made from `submitted`
 * rather than `submitted` itself or an operation already in `history`.
 */
export function isSynthesized(
  submitted: Action,
  operation: Operation,
  history: readonly Operation[],
): boolean {
  if (!SYNTHESIZING_TYPES.has(submitted.type)) {
    return false;
  }
  const id = operation.action.id as string | undefined;
  if (!id) {
    return true;
  }
  if (id === submitted.id) {
    return false;
  }
  return !history.some((existing) => existing.action.id === id);
}

/**
 * Signs the synthesized action of `operation` in place as `signer`. A REDO's
 * rebuilt action has no id or timestamp, so it takes a fresh id and the
 * submitted timestamp; the operation timestamp is set to the action's, which
 * a peer requires of a v2 tuple.
 */
export async function signSynthesized(
  operation: Operation,
  submitted: Action,
  target: ActionSigningTarget & { scope: string },
  signer: ISigner,
  signal?: AbortSignal,
): Promise<void> {
  const synthesized = operation.action;
  const id = (synthesized.id as string | undefined) || generateId();
  const timestampUtcMs =
    (operation.timestampUtcMs as string | undefined) ||
    (synthesized.timestampUtcMs as string | undefined) ||
    submitted.timestampUtcMs;

  const action: Action = {
    id,
    timestampUtcMs,
    type: synthesized.type,
    input: synthesized.input,
    scope: synthesized.scope,
  };
  const signature = await signer.signAction(
    action,
    { documentId: target.documentId, branch: target.branch },
    signal,
  );

  operation.action = {
    ...action,
    context: {
      signer: { ...actionSignerIdentity(signer), signatures: [signature] },
    },
  };
  operation.id = deriveOperationId(
    target.documentId,
    target.scope,
    target.branch,
    id,
  );
  operation.timestampUtcMs = timestampUtcMs;
}
