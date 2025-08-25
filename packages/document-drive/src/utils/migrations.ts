import {
  type DocumentOperations,
  type Operation,
  type PHDocument,
  type Signature,
} from "document-model";

export function migrateDocumentOperationSignatures(
  document: PHDocument,
): PHDocument | undefined {
  let legacy = false;
  const operations = Object.entries(
    document.operations,
  ).reduce<DocumentOperations>(
    (acc, [key, operations]) => {
      const scope = key;
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
  return legacy ? { ...document, operations } : document;
}

export function migrateLegacyOperationSignature<TGlobalState, TLocalState>(
  operation: Operation,
): Operation {
  let needsMigration = false;
  let newOperation = { ...operation };

  // Check both top-level context and action.context for legacy signatures
  const topLevelSigner = (operation as any).context?.signer;
  const actionSigner = operation.action?.context?.signer;

  // Handle top-level context migration (legacy structure)
  if (topLevelSigner) {
    if ("signature" in topLevelSigner) {
      const signature = topLevelSigner.signature as string | undefined;
      (newOperation as any) = {
        ...newOperation,
        context: {
          ...(newOperation as any).context,
          signer: {
            user: topLevelSigner.user,
            app: topLevelSigner.app,
            signatures: (signature?.length
              ? [signature]
              : []) as unknown as Signature[],
          },
        },
      };
      needsMigration = true;
    } else if (topLevelSigner.signatures) {
      const cleanSignatures = topLevelSigner.signatures.filter(
        (sig: any) => sig && sig.length > 0,
      );
      if (cleanSignatures.length !== topLevelSigner.signatures.length) {
        (newOperation as any) = {
          ...newOperation,
          context: {
            ...(newOperation as any).context,
            signer: {
              ...topLevelSigner,
              signatures: cleanSignatures as unknown as Signature[],
            },
          },
        };
        needsMigration = true;
      }
    }
  }

  // Handle action.context migration
  if (actionSigner) {
    if ("signature" in actionSigner) {
      const signature = actionSigner.signature as string | undefined;
      const migratedContext = {
        ...newOperation.action!.context,
        signer: {
          user: actionSigner.user,
          app: actionSigner.app,
          signatures: (signature?.length
            ? [signature]
            : []) as unknown as Signature[],
        },
      };
      (newOperation as any) = {
        ...newOperation,
        action: {
          ...newOperation.action!,
          context: migratedContext,
        },
        context: migratedContext, // Also set top-level context
      };
      needsMigration = true;
    } else if (actionSigner.signatures) {
      const cleanSignatures = actionSigner.signatures.filter(
        (sig: any) => sig && sig.length > 0,
      );
      if (cleanSignatures.length !== actionSigner.signatures.length) {
        const migratedContext = {
          ...newOperation.action!.context,
          signer: {
            ...actionSigner,
            signatures: cleanSignatures as unknown as Signature[],
          },
        };
        (newOperation as any) = {
          ...newOperation,
          action: {
            ...newOperation.action!,
            context: migratedContext,
          },
          context: migratedContext, // Also set top-level context
        };
        needsMigration = true;
      }
    }
  }

  return needsMigration ? newOperation : operation;
}
