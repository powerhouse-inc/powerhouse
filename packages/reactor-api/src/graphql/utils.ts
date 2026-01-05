import type {
  Context,
  GqlDocument,
  GqlDriveDocument,
  GqlOperation,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type { DocumentDriveDocument } from "document-drive";
import type { Operation, PHDocument } from "document-model";
import { getDocumentModelSchemaName } from "../utils/create-schema.js";
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
  const state = "global" in doc.state ? doc.state.global : {};
  const initialState =
    "global" in doc.initialState ? doc.initialState.global : {};
  return {
    id: doc.header.id,
    name: doc.header.name,
    documentType: doc.header.documentType,
    revision: doc.header.revision.global || 0,
    createdAtUtcIso: doc.header.createdAtUtcIso,
    lastModifiedAtUtcIso: doc.header.lastModifiedAtUtcIso,
    operations: [],
    stateJSON: state as JSON,
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

export const IDocumentGraphql = {
  graphql: "document(id: String!): IDocument",
  Query: {
    document: async (
      parent: unknown,
      args: { id: string },
      ctx: Context,
    ): Promise<GqlDocument> => {
      const doc = await ctx.driveServer.getDocument(args.id);
      ctx.document = doc;
      return buildGraphQlDocument(doc);
    },
  },
  resolvers: {
    IDocument: {
      __resolveType: (obj: GqlDocument, ctx: Context) => {
        if (obj.__typename) {
          return obj.__typename;
        }
        const modules = ctx.driveServer.getDocumentModelModules();
        const module = modules.find(
          (module) => module.documentModel.global.id === obj.documentType,
        );
        if (!module) return "GqlDocument";
        return getDocumentModelSchemaName(module.documentModel.global);
      },
      operations: (
        obj: unknown,
        { skip = 0, first = 10 }: { skip?: number; first?: number },
        ctx: Context,
      ) => {
        const documentOperations = ctx.document?.operations;
        const operations =
          documentOperations && "global" in documentOperations
            ? documentOperations.global
            : [];
        return buildGraphqlOperations(operations, skip, first);
      },
    },
  },
};
