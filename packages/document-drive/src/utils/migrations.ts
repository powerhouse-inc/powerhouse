import {
  Action,
  Document,
  DocumentOperations,
  Operation,
  OperationScope,
} from "document-model/document";
import { DocumentStorage } from "../storage/types.js";

export function migrateDocumentOperationSigatures<D extends Document>(
  document: DocumentStorage<D>,
): DocumentStorage<D> | undefined {
  let legacy = false;
  const operations = Object.entries(document.operations).reduce<
    DocumentOperations<Action>
  >(
    (acc, [key, operations]) => {
      const scope = key as unknown as OperationScope;
      for (const op of operations) {
        const newOp = migrateLegacyOperationSignature(op);
        acc[scope].push(newOp);
        if (newOp !== op) {
          legacy = true;
        }
      }
      return acc;
    },
    { global: [], local: [] },
  );
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return legacy ? { ...document, operations } : document;
}

export function migrateLegacyOperationSignature<A extends Action>(
  operation: Operation<A>,
): Operation<A> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!operation.context?.signer || operation.context.signer.signatures) {
    return operation;
  }
  const { signer } = operation.context;
  if ("signature" in signer) {
    const signature = signer.signature as string | undefined;
    return {
      ...operation,
      context: {
        ...operation.context,
        signer: {
          user: signer.user,
          app: signer.app,
          signatures: signature?.length ? [signature] : [],
        },
      },
    };
  } else {
    return operation;
  }
}
