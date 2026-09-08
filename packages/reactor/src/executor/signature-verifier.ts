import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  parseSignatureHashField,
} from "@powerhousedao/shared/document-model";
import { InvalidSignatureError } from "../shared/errors.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import { GATED_DOCUMENT_ACTIONS, targetDocumentId } from "./util.js";

/**
 * The document an action is verified against: the one it writes to, which for a
 * document-scope action is not always the job's own document. Verifying against
 * the job's id instead would check a signature against a document the action
 * never lands on (#2894).
 */
function verificationDocumentId(action: Action, fallback: string): string {
  return GATED_DOCUMENT_ACTIONS.has(action.type)
    ? targetDocumentId({ type: action.type, input: action.input }, fallback)
    : fallback;
}

/**
 * The state an action leaves behind, as its own last signature declares it.
 * Undefined when that signature carries no resulting hash (#2894).
 */
function declaredResultingStateHash(
  action: Action | undefined,
): string | undefined {
  const signatures = action?.context?.signer?.signatures;
  if (!signatures?.length) {
    return undefined;
  }
  return parseSignatureHashField(signatures[signatures.length - 1][3])
    .resultingStateHash;
}

export class SignatureVerifier {
  constructor(private verifier?: SignatureVerificationHandler) {}

  async verifyActions(
    documentId: string,
    branch: string,
    actions: Action[],
    previousStateHash?: string,
  ): Promise<void> {
    if (!this.verifier) {
      return;
    }

    for (const [index, entry] of actions.entries()) {
      // Each action applies to the state the one before it left, not to the
      // stored head, so the expected previous state chains through the batch.
      const expectedPrevState =
        index === 0
          ? previousStateHash
          : declaredResultingStateHash(actions[index - 1]);

      // A malformed submission can arrive with a missing action even though
      // the type says otherwise. Without an action there is nothing signed to
      // check, so it is treated as unsigned, like any signer-less action
      // (#2894).
      const action: Action | undefined = entry;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `action` is required by the type but can be absent at runtime
      if (!action?.context?.signer) {
        continue;
      }
      const signer = action.context.signer;

      if (signer.signatures.length === 0) {
        throw new InvalidSignatureError(
          documentId,
          `Action ${action.id} has signer but no signatures`,
        );
      }

      const publicKey = signer.app.key;
      const actionDocumentId = verificationDocumentId(action, documentId);

      let isValid: boolean;

      try {
        const tempOperation: Operation = {
          id: deriveOperationId(
            actionDocumentId,
            action.scope,
            branch,
            action.id,
          ),
          index: 0,
          timestampUtcMs: action.timestampUtcMs || new Date().toISOString(),
          hash: "",
          skip: 0,
          action: action,
        };

        isValid = await this.verifier(tempOperation, publicKey, {
          documentId: actionDocumentId,
          branch,
          ...(expectedPrevState === undefined
            ? {}
            : { previousStateHash: expectedPrevState }),
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new InvalidSignatureError(
          documentId,
          `Action ${action.id} verification failed: ${errorMessage}`,
        );
      }

      if (!isValid) {
        throw new InvalidSignatureError(
          documentId,
          `Action ${action.id} signature verification returned false`,
        );
      }
    }
  }

  async verifyOperations(
    documentId: string,
    operations: Operation[],
    previousStateHash?: string,
  ): Promise<void> {
    if (!this.verifier) {
      return;
    }

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const expectedPrevState =
        i === 0
          ? previousStateHash
          : declaredResultingStateHash(operations[i - 1].action);
      const action: Action | undefined = operation.action;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `action` is required by the type but can be absent at runtime
      if (!action?.context?.signer) {
        continue;
      }
      const signer = action.context.signer;

      if (signer.signatures.length === 0) {
        throw new InvalidSignatureError(
          documentId,
          `Operation ${operation.id} at index ${operation.index} has signer but no signatures`,
        );
      }

      const publicKey = signer.app.key;
      const actionDocumentId = verificationDocumentId(action, documentId);

      let isValid: boolean;

      try {
        isValid = await this.verifier(operation, publicKey, {
          documentId: actionDocumentId,
          ...(expectedPrevState === undefined
            ? {}
            : { previousStateHash: expectedPrevState }),
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new InvalidSignatureError(
          documentId,
          `Operation ${operation.id} at index ${operation.index} verification failed: ${errorMessage}`,
        );
      }

      if (!isValid) {
        throw new InvalidSignatureError(
          documentId,
          `Operation ${operation.id} at index ${operation.index} signature verification returned false`,
        );
      }
    }
  }
}
