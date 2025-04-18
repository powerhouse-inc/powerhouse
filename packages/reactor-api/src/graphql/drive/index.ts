import { Subgraph } from "#graphql/base/index.js";
import { type Context, type SubgraphArgs } from "#graphql/types.js";
import {
  type InternalStrandUpdate,
  processAcknowledge,
  processGetStrands,
  processPushUpdate,
} from "#sync/utils.js";
import { type GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";
import { pascalCase } from "change-case";
import {
  childLogger,
  type FileNode,
  generateUUID,
  type ListenerFilter,
  type ListenerRevision,
  PullResponderTransmitter,
  type StrandUpdateGraphQL,
} from "document-drive";
import { type Listener } from "document-drive/server/types";
import {
  type DocumentModelInput,
  type Operation,
  type PHDocument,
} from "document-model";
import { gql } from "graphql-tag";
import { type Asset } from "./temp-hack-rwa-type-defs.js";

const driveKindTypeNames: Record<string, string> = {
  file: "DocumentDrive_FileNode",
  folder: "DocumentDrive_FolderNode",
};

export class DriveSubgraph extends Subgraph {
  private logger = childLogger([
    "DriveSubgraph",
    Math.floor(Math.random() * 999).toString(),
  ]);

  constructor(args: SubgraphArgs) {
    super(args);

    this.logger.verbose(`constructor()`);
  }

  // Note: This GQL declaration depends on the document drive subgraph already
  // being registered. If the document drive subgraph is not registered, this
  // will throw an error as it relies on those types.
  name = "d/:drive";
  typeDefs = gql`
    type DriveMeta {
      preferredEditor: String
    }

    extend type DocumentDrive_DocumentDriveState {
      meta: DriveMeta
    }

    type Query {
      system: System
      drive: DocumentDrive_DocumentDriveState
      document(id: String!): IDocument
      documents: [String!]!
    }

    type Mutation {
      registerPullResponderListener(
        filter: InputListenerFilter!
        listenerId: String
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
        return obj.documentType
          ? driveKindTypeNames.file
          : driveKindTypeNames.folder;
      },
    },
    DocumentDrive_Node: {
      __resolveType: (obj: FileNode) => {
        return obj.documentType
          ? driveKindTypeNames.file
          : driveKindTypeNames.folder;
      },
    },
    Document: {
      operations: async (
        obj: PHDocument,
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
        this.logger.verbose(`drive()`, args);
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const drive = await this.reactor.getDrive(ctx.driveId);
        return {
          meta: drive.meta,
          ...drive.state.global,
          nodes: drive.state.global.nodes,
        };
      },
      documents: async (_: unknown, args: unknown, ctx: Context) => {
        this.logger.verbose(`documents(drive: ${ctx.driveId})`, args);
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const documents = await this.reactor.getDocuments(ctx.driveId);
        return documents;
      },
      document: async (_: unknown, { id }: { id: string }, ctx: Context) => {
        this.logger.verbose(`document(drive: ${ctx.driveId}, id: ${id})`);
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const document = await (ctx.driveId === id
          ? this.reactor.getDrive(id)
          : this.reactor.getDocument(ctx.driveId, id));

        const dms = this.reactor.getDocumentModelModules();
        const dm = dms.find(
          ({ documentModel }) => documentModel.id === document.documentType,
        );
        const globalState = document.state.global;
        if (!globalState) throw new Error("Document not found");
        const typeName = pascalCase(
          (dm?.documentModel.name || "").replaceAll("/", " "),
        );
        const response = {
          ...document,
          id,
          revision: document.revision.global,
          state: document.state.global,
          stateJSON: document.state.global,
          operations: document.operations.global.map((op: Operation) => ({
            ...op,
            inputText:
              typeof op.input === "string"
                ? op.input
                : JSON.stringify(op.input),
          })),
          initialState: document.initialState.state.global,
          __typename: typeName,
        };
        return response;
      },
      system: () => ({ sync: {} }),
    },
    Mutation: {
      registerPullResponderListener: async (
        _: unknown,
        { filter, listenerId }: { filter: ListenerFilter; listenerId?: string },
        ctx: Context,
      ) => {
        this.logger.verbose(
          `registerPullResponderListener(drive: ${ctx.driveId})`,
          filter,
        );

        if (!ctx.driveId) {
          throw new Error("Drive ID is required");
        }

        // Create the listener and transmitter
        const uuid = listenerId ?? generateUUID();
        const listener: Listener = {
          driveId: ctx.driveId,
          listenerId: uuid,
          block: false,
          filter,
          system: false,
          label: `Pullresponder #${uuid}`,
          callInfo: {
            data: "",
            name: "PullResponder",
            transmitterType: "PullResponder",
          },
        };

        // TODO: circular reference
        // TODO: once we have DI, remove this and pass around
        const listenerManager = this.reactor.listeners;
        listener.transmitter = new PullResponderTransmitter(
          listener,
          listenerManager,
        );

        // set the listener on the manager directly (bypassing operations)
        try {
          await listenerManager.setListener(ctx.driveId, listener);
        } catch (error) {
          this.logger.error(`Failed to register ephemeral listener: ${error}`);
          throw new Error(`Listener couldn't be registered: ${error}`);
        }

        // for backwards compatibility: return everything but the transmitter
        return {
          driveId: listener.driveId,
          listenerId: listener.listenerId,
          label: listener.label,
          block: listener.block,
          system: listener.system,
          filter: listener.filter,
          callInfo: listener.callInfo,
        };
      },
      pushUpdates: async (
        _: unknown,
        { strands: strandsGql }: { strands: StrandUpdateGraphQL[] },
        ctx: Context,
      ) => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        this.logger.verbose(`pushUpdates(drive: ${ctx.driveId})`, strandsGql);

        // translate data types
        const strands: InternalStrandUpdate[] = strandsGql.map((strandGql) => {
          return {
            operations: strandGql.operations.map((op) => ({
              ...op,
              input: JSON.parse(op.input) as DocumentModelInput,
              skip: op.skip ?? 0,
              scope: strandGql.scope,
              branch: "main",
            })) as Operation[],
            documentId: strandGql.documentId,
            driveId: strandGql.driveId,
            scope: strandGql.scope,
            branch: strandGql.branch,
          };
        });

        // return a list of listener revisions
        return await Promise.all(
          strands.map((strand) => processPushUpdate(this.reactor, strand)),
        );
      },
      acknowledge: async (
        _: unknown,
        {
          listenerId,
          revisions,
        }: { listenerId: string; revisions: ListenerRevision[] },
        ctx: Context,
      ) => {
        this.logger.verbose(
          `acknowledge(drive: ${ctx.driveId}, listenerId: ${listenerId})`,
          revisions,
        );

        if (!listenerId || !revisions) return false;
        if (!ctx.driveId) throw new Error("Drive ID is required");

        // translate data types
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

        // return a boolean indicating if the acknowledge was successful
        return await processAcknowledge(
          this.reactor,
          ctx.driveId,
          listenerId,
          validEntries,
        );
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
        this.logger.verbose(
          `strands(drive: ${ctx.driveId}, listenerId: ${listenerId}, since:${since})`,
        );
        if (!ctx.driveId) throw new Error("Drive ID is required");

        // get the requested strand updates
        const strands = await processGetStrands(
          this.reactor,
          ctx.driveId,
          listenerId,
          since,
        );

        // translate data types
        return strands.map((update) => ({
          driveId: update.driveId,
          documentId: update.documentId,
          scope: update.scope,
          branch: update.branch,
          operations: update.operations.map((op) => ({
            index: op.index,
            skip: op.skip,
            name: op.type,
            input: JSON.stringify(op.input),
            hash: op.hash,
            timestamp: op.timestamp,
            type: op.type,
            context: op.context,
            id: op.id,
          })),
        }));
      },
    },
  };
}
