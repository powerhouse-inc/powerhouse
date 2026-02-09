import type { Action, Operation } from "document-model";
import { deriveOperationId } from "document-model/core";
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

    for (const action of actions) {
      const signer = action.context?.signer;

      if (!signer) {
        continue;
      }

      if (signer.signatures.length === 0) {
        throw new InvalidSignatureError(
          documentId,
          `Action ${action.id} has signer but no signatures`,
        );
      }

      const publicKey = signer.app.key;
      let isValid = false;

      try {
        const tempOperation: Operation = {
          id: deriveOperationId(documentId, action.scope, branch, action.id),
          index: 0,
          timestampUtcMs: action.timestampUtcMs || new Date().toISOString(),
          hash: "",
          skip: 0,
          action: action,
        };

        isValid = await this.verifier(tempOperation, publicKey);
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
      const signer = operation.action.context?.signer;

      if (!signer) {
        continue;
      }

      if (signer.signatures.length === 0) {
        throw new InvalidSignatureError(
          documentId,
          `Operation ${operation.id} at index ${operation.index} has signer but no signatures`,
        );
      }

      const publicKey = signer.app.key;
      let isValid = false;

      try {
        isValid = await this.verifier(operation, publicKey);
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
