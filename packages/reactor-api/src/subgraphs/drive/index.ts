import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import {
  generateUUID,
  ListenerRevision,
  PullResponderTransmitter,
  StrandUpdateGraphQL,
} from "document-drive";
import {
  actions,
  DocumentDriveAction,
  FileNode,
  Listener,
  ListenerFilter,
  TransmitterType,
} from "document-model-libs/document-drive";
import { BaseAction, Document, Operation } from "document-model/document";
import {
  DocumentModelInput,
  DocumentModelState,
} from "document-model/document-model";
import { gql } from "graphql-tag";
import { Subgraph } from "../base";
import { Context } from "../types";
import { Asset } from "./temp-hack-rwa-type-defs";

export class DriveSubgraph extends Subgraph {
  name = "d/:drive";
  typeDefs = gql`
    type Query {
      system: System
      drive: DocumentDrive_DocumentDriveState
      document(id: String!): IDocument
      documents: [String!]!
    }

    type Mutation {
      registerPullResponderListener(
        filter: InputListenerFilter!
      ): DocumentDrive_Listener
      pushUpdates(strands: [InputStrandUpdate!]): [ListenerRevision!]!
      acknowledge(
        listenerId: String!
        revisions: [ListenerRevisionInput]
      ): Boolean
    }

    input InputOperationSignerUser {
      address: String!
      networkId: String!
      chainId: Int!
    }

    type OperationSignerUser {
      address: String!
      networkId: String!
      chainId: Int!
    }

    input InputOperationSignerApp {
      name: String!
      key: String!
    }

    type OperationSignerApp {
      name: String!
      key: String!
    }

    type OperationSigner {
      app: OperationSignerApp
      user: OperationSignerUser
      signatures: [[String!]]!
    }

    input InputOperationSigner {
      app: InputOperationSignerApp
      user: InputOperationSignerUser
      signatures: [[String!]]!
    }

    type OperationContext {
      signer: OperationSigner
    }

    input InputOperationContext {
      signer: InputOperationSigner
    }

    input InputOperationUpdate {
      index: Int!
      skip: Int
      type: String!
      id: String!
      input: String!
      hash: String!
      timestamp: String!
      error: String
      context: InputOperationContext
    }

    type OperationUpdate {
      index: Int!
      skip: Int
      type: String!
      id: String!
      input: String!
      hash: String!
      timestamp: String!
      error: String
      context: OperationContext
    }

    type StrandUpdate {
      driveId: String!
      documentId: String!
      scope: String!
      branch: String!
      operations: [OperationUpdate!]!
    }

    input InputStrandUpdate {
      driveId: String!
      documentId: String!
      scope: String!
      branch: String!
      operations: [InputOperationUpdate!]!
    }

    input InputListenerFilter {
      documentType: [String!]
      documentId: [String!]
      scope: [String!]
      branch: [String!]
    }

    enum UpdateStatus {
      SUCCESS
      MISSING
      CONFLICT
      ERROR
    }

    input ListenerRevisionInput {
      driveId: String!
      documentId: String!
      scope: String!
      branch: String!
      status: UpdateStatus!
      revision: Int!
    }

    type ListenerRevision {
      driveId: String!
      documentId: String!
      scope: String!
      branch: String!
      status: UpdateStatus!
      revision: Int!
      error: String
    }

    type System {
      sync: Sync
    }

    type Sync {
      strands(listenerId: ID!, since: String): [StrandUpdate!]!
    }
  `;

  resolvers: GraphQLResolverMap<Context> = {
    Asset: {
      __resolveType: (obj: Asset) => {
        return obj.type;
      },
    },
    Node: {
      __resolveType: (obj: FileNode) => {
        return obj.documentType ? "FileNode" : "FolderNode";
      },
    },
    Document: {
      operations: async (
        obj: Document,
        { first, skip }: { first: number; skip: number },
        ctx: Context,
      ) => {
        const limit = first ?? 0;
        const start = skip ?? 0;
        return obj.operations.global.slice(start, start + limit);
      },
    },
    Query: {
      drive: async (_: unknown, args: unknown, ctx: Context) => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const drive = await this.reactor.getDrive(ctx.driveId);
        return drive.state.global;
      },
      documents: async (_: unknown, args: unknown, ctx: Context) => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const documents = await this.reactor.getDocuments(ctx.driveId);
        return documents;
      },
      document: async (_: unknown, { id }: { id: string }, ctx: Context) => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const document = await this.reactor.getDocument(ctx.driveId, id);

        const dms = this.reactor.getDocumentModels();
        const dm = dms.find(
          ({ documentModel }: { documentModel: DocumentModelState }) =>
            documentModel.id === document.documentType,
        );
        const globalState = document.state.global;
        if (!globalState) throw new Error("Document not found");
        const response = {
          ...document,
          id,
          revision: document.revision.global,
          state: document.state.global,
          operations: document.operations.global.map((op: Operation) => ({
            ...op,
            inputText:
              typeof op.input === "string"
                ? op.input
                : JSON.stringify(op.input),
          })),
          initialState: document.initialState.state.global,
          __typename: dm?.documentModel.name,
        };
        return response;
      },
      system: () => ({ sync: {} }),
    },
    Mutation: {
      registerPullResponderListener: async (
        _: unknown,
        { filter }: { filter: ListenerFilter },
        ctx: Context,
      ) => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const uuid = generateUUID();
        const listener: Listener = {
          block: false,
          callInfo: {
            data: "",
            name: "PullResponder",
            transmitterType: "PullResponder" as TransmitterType,
          },
          filter: {
            branch: filter.branch ?? [],
            documentId: filter.documentId ?? [],
            documentType: filter.documentType ?? [],
            scope: filter.scope ?? [],
          },
          label: `Pullresponder #${uuid}`,
          listenerId: uuid,
          system: false,
        };

        const result = await this.reactor.queueDriveAction(
          ctx.driveId,
          actions.addListener({ listener }),
        );

        if (result.status !== "SUCCESS" && result.error) {
          throw new Error(
            `Listener couldn't be registered: ${result.error.message}`,
          );
        }

        return listener;
      },
      pushUpdates: async (
        _: unknown,
        { strands }: { strands: StrandUpdateGraphQL[] },
        ctx: Context,
      ) => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const listenerRevisions: ListenerRevision[] = await Promise.all(
          strands.map(async (s) => {
            const operations =
              s.operations.map((o) => ({
                ...o,
                input: JSON.parse(o.input) as DocumentModelInput,
                skip: o.skip ?? 0,
                scope: s.scope,
                branch: "main",
              })) ?? [];

            const result = await (s.documentId !== undefined
              ? this.reactor.queueOperations(
                  s.driveId,
                  s.documentId,
                  operations,
                )
              : this.reactor.queueDriveOperations(
                  s.driveId,
                  operations as Operation<DocumentDriveAction | BaseAction>[],
                ));

            const scopeOperations = result.document?.operations[s.scope] ?? [];
            if (scopeOperations.length === 0) {
              return {
                revision: -1,
                branch: s.branch,
                documentId: s.documentId ?? "",
                driveId: s.driveId,
                scope: s.scope,
                status: result.status,
              };
            }

            const revision = scopeOperations.slice().pop()?.index ?? -1;
            return {
              revision,
              branch: s.branch,
              documentId: s.documentId ?? "",
              driveId: s.driveId,
              scope: s.scope,
              status: result.status,
              error: result.error?.message || undefined,
            };
          }),
        );

        return listenerRevisions;
      },
      acknowledge: async (
        _: unknown,
        {
          listenerId,
          revisions,
        }: { listenerId: string; revisions: ListenerRevision[] },
        ctx: Context,
      ) => {
        if (!listenerId || !revisions) return false;
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const validEntries = revisions
          .filter((r) => r !== null)
          .map((e) => ({
            driveId: e.driveId,
            documentId: e.documentId,
            scope: e.scope,
            branch: e.branch,
            revision: e.revision,
            status: e.status,
          }));

        const transmitter = (await this.reactor.getTransmitter(
          ctx.driveId,
          listenerId,
        )) as PullResponderTransmitter;
        const result = await transmitter.processAcknowledge(
          ctx.driveId ?? "1",
          listenerId,
          validEntries,
        );

        return result;
      },
    },
    System: {},
    Sync: {
      strands: async (
        _: unknown,
        {
          listenerId,
          since,
        }: { listenerId: string; since: string | undefined },
        ctx: Context,
      ) => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const listener = (await this.reactor.getTransmitter(
          ctx.driveId,
          listenerId,
        )) as PullResponderTransmitter;
        const strands = await listener.getStrands({ since });
        return strands.map((e) => ({
          driveId: e.driveId,
          documentId: e.documentId,
          scope: e.scope,
          branch: e.branch,
          operations: e.operations.map((o) => ({
            index: o.index,
            skip: o.skip,
            name: o.type,
            input: JSON.stringify(o.input),
            hash: o.hash,
            timestamp: o.timestamp,
            type: o.type,
            context: o.context,
            id: o.id,
          })),
        }));
      },
    },
  };
}
