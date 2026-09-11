import type { Action, Operation } from "@powerhousedao/shared/document-model";
import { deriveOperationId } from "@powerhousedao/shared/document-model";
import { InvalidSignatureError } from "../shared/errors.js";
import type { SignatureVerificationHandler } from "../signer/types.js";

export class SignatureVerifier {
  constructor(private verifier?: SignatureVerificationHandler) {}

  async verifyActions(
    documentId: string,
    branch: string,
    actions: Action[],
  ): Promise<void> {
    if (!this.verifier) {
      return;
    }

    for (const entry of actions) {
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

      let isValid: boolean;

      try {
        const tempOperation: Operation = {
          id: deriveOperationId(documentId, action.scope, branch, action.id),
          index: 0,
          timestampUtcMs: action.timestampUtcMs || new Date().toISOString(),
          hash: "",
          skip: 0,
          action: action,
        };

        isValid = await this.verifier(tempOperation, publicKey, {
          documentId,
          branch,
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
  ): Promise<void> {
    if (!this.verifier) {
      return;
    }

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
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

      let isValid: boolean;

      try {
        isValid = await this.verifier(operation, publicKey, { documentId });
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
