import type {
  Action,
  ActionSigner,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";

export const SECRET = "test-deployment-secret";

export function signer(address: string, appKey: string): ActionSigner {
  return {
    user: { address, networkId: "eip155", chainId: 1 },
    app: { name: "test", key: appKey },
    signatures: [],
  };
}

export function op(options: {
  ordinal: number;
  documentId: string;
  type: string;
  input?: unknown;
  scope?: string;
  documentType?: string;
  signer?: ActionSigner;
}): OperationWithContext {
  const scope = options.scope ?? "global";
  const action = {
    id: `action-${options.ordinal}`,
    type: options.type,
    scope,
    input: options.input ?? {},
    timestampUtcMs: "2026-09-23T00:00:00.000Z",
    ...(options.signer ? { context: { signer: options.signer } } : {}),
  } as Action;
  return {
    operation: {
      id: `operation-${options.ordinal}`,
      index: options.ordinal,
      skip: 0,
      timestampUtcMs: "2026-09-23T00:00:00.000Z",
      hash: `hash-${options.ordinal}`,
      action,
    },
    context: {
      documentId: options.documentId,
      documentType: options.documentType ?? "powerhouse/document-model",
      scope,
      branch: "main",
      ordinal: options.ordinal,
    },
  };
}
