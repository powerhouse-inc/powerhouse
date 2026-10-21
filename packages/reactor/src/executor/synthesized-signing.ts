import type {
  Action,
  ActionSigningTarget,
  ISigner,
  Operation,
  SynthesizedIdForm,
} from "@powerhousedao/shared/document-model";
import {
  actionSignerIdentity,
  assertNever,
  deriveOperationId,
  hashBrowser,
} from "@powerhousedao/shared/document-model";

/** Submitted types whose stored action the reducer writes in their place. */
export const SYNTHESIZING_TYPES: ReadonlySet<string> = new Set([
  "UNDO",
  "REDO",
]);

/**
 * The id of the action synthesized from `submittedId`. Derived, so the stored
 * operation answers for the submitted id at the live-id check. The suffixed
 * form sorts against every other id as the submitted id does; the hashed form
 * is what released stores hold.
 */
export function synthesizedActionId(
  submittedId: string,
  form: SynthesizedIdForm,
): string {
  switch (form) {
    case "suffixed":
      return `${submittedId}.s`;
    case "hashed":
      return hashBrowser(`synthesized:${submittedId}`, "sha1", "hex").slice(
        0,
        32,
      );
    default:
      return assertNever(form, "synthesized id form");
  }
}

/** Every form, for a lookup that does not know the document's version. */
export function synthesizedActionIds(submittedId: string): string[] {
  return [
    synthesizedActionId(submittedId, "suffixed"),
    synthesizedActionId(submittedId, "hashed"),
  ];
}

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
 * Signs the synthesized action of `operation` in place as `signer`, under the
 * id {@link synthesizedActionId} derives from the submitted one. A REDO's
 * rebuilt action has no timestamp, so it takes the submitted one; the
 * operation timestamp is set to the action's, which a peer requires of a v2
 * tuple.
 */
export async function signSynthesized(
  operation: Operation,
  submitted: Action,
  target: ActionSigningTarget & { scope: string },
  signer: ISigner,
  form: SynthesizedIdForm,
  signal?: AbortSignal,
): Promise<void> {
  const synthesized = operation.action;
  const id = synthesizedActionId(submitted.id, form);
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
