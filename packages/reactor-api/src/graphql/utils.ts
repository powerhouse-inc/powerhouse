import type {
  GqlDocument,
  GqlDriveDocument,
  GqlOperation,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { BaseSubgraph } from "./base-subgraph.js";

export function isSubgraphClass(
  candidate: unknown,
): candidate is SubgraphClass {
  if (typeof candidate !== "function") return false;

  let proto: unknown = Object.getPrototypeOf(candidate);
  while (proto) {
    if (Object.prototype.isPrototypeOf.call(proto, BaseSubgraph)) return true;

    proto = Object.getPrototypeOf(proto);
  }

  return false;
}

export function buildGraphqlOperations(
  operations: Operation[],
  skip: number,
  first: number,
): GqlOperation[] {
  return operations.slice(skip, skip + first).map(buildGraphqlOperation);
}

export function buildGraphqlOperation(operation: Operation): GqlOperation {
  const signer = operation.action.context?.signer;
  return {
    id: operation.id ?? "",
    type: operation.action.type,
    index: operation.index,
    timestampUtcMs: operation.timestampUtcMs,
    hash: operation.hash,
    skip: operation.skip,
    inputText:
      typeof operation.action.input === "string"
        ? operation.action.input
        : JSON.stringify(operation.action.input),
    error: operation.error,
    context: {
      signer: signer
        ? {
            user: signer.user,
            app: signer.app,
            signatures: signer.signatures.map((sig) =>
              Array.isArray(sig) ? sig.join(", ") : sig,
            ),
          }
        : undefined,
    },
  };
}

export function buildGraphQlDocument(doc: PHDocument): GqlDocument {
  // Return full state with all scopes (auth, document, global, local)
  // This matches the ReactorSubgraph pattern in adapters.ts
  const state = doc.state;
  const initialState = doc.initialState;
  // For stateJSON, use global state for backward compatibility
  const globalState = "global" in doc.state ? doc.state.global : {};
  return {
    id: doc.header.id,
    name: doc.header.name,
    documentType: doc.header.documentType,
    revision: doc.header.revision.global || 0,
    createdAtUtcIso: doc.header.createdAtUtcIso,
    lastModifiedAtUtcIso: doc.header.lastModifiedAtUtcIso,
    operations: [],
    stateJSON: globalState as JSON,
    state,
    initialState,
  };
}

export function buildGraphQlDriveDocument(
  doc: DocumentDriveDocument,
): GqlDriveDocument {
  const gqlDoc = buildGraphQlDocument(doc);
  return {
    ...gqlDoc,
    meta: {
      preferredEditor: doc.header.meta?.preferredEditor,
    },
    slug: doc.header.slug,
    state: doc.state.global,
    initialState: doc.state.global,
  };
}
