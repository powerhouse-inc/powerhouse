import {
  BaseDocument,
  DocumentOperations,
  Operation,
  OperationScope,
} from "document-model";
import { Signature } from "../../../document-model/src/document/types.js";

export function migrateDocumentOperationSignatures<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
): BaseDocument<TGlobalState, TLocalState> | undefined {
  let legacy = false;
  const operations = Object.entries(
    document.operations,
  ).reduce<DocumentOperations>(
    (acc, [key, operations]) => {
      const scope = key as OperationScope;
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

export function migrateLegacyOperationSignature<TGlobalState, TLocalState>(
  operation: Operation,
): Operation {
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
          signatures: (signature?.length
            ? [signature]
            : []) as unknown as Signature[],
        },
      },
    };
  } else {
    return operation;
  }
}
