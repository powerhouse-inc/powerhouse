import type { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";
import { Subgraph } from "@powerhousedao/reactor-api";
import { pascalCase } from "change-case";
import type {
  DocumentDriveDocument,
  DriveInfo,
  FileNode,
  ListenerFilter,
  ListenerRevision,
  ServerListener,
  StrandUpdateGraphQL,
} from "document-drive";
import {
  childLogger,
  PullResponderTransmitter,
  responseForDocument,
  responseForDrive,
} from "document-drive";
import type { DocumentModelInput, Operation, PHDocument } from "document-model";
import { generateId } from "document-model";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import type { InternalStrandUpdate } from "../sync/utils.js";
import {
  processAcknowledge,
  processGetStrands,
  processPushUpdate,
} from "../sync/utils.js";
import type { Asset } from "./temp-hack-rwa-type-defs.js";
import type { Context, SubgraphArgs } from "./types.js";

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
      drive: DriveInfo
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
      actionId: String!
      input: String!
      hash: String!
      timestampUtcMs: String!
      error: String
      context: InputOperationContext
    }

    type OperationUpdate {
      index: Int!
      skip: Int
      type: String!
      id: String!
      actionId: String!
      input: String!
      hash: String!
      timestampUtcMs: String!
      error: String
      context: OperationContext
    }

    type StrandUpdate {
      driveId: String!
      documentId: String!
      documentType: String!
      scope: String!
      branch: String!
      operations: [OperationUpdate!]!
    }

    input InputStrandUpdate {
      driveId: String!
      documentId: String!
      documentType: String!
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
      documentType: String!
      scope: String!
      branch: String!
      status: UpdateStatus!
      revision: Int!
    }

    type ListenerRevision {
      driveId: String!
      documentId: String!
      documentType: String!
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

    type DriveInfo {
      id: String!
      name: String!
      slug: String!
      meta: DriveMeta
      icon: String
    }
  `;

  private async getDriveIdBySlugOrId(slugOrId: string): Promise<string> {
    try {
      return await this.reactor.getDriveIdBySlug(slugOrId);
    } catch {
      const drive = await this.reactor.getDrive(slugOrId);
      return drive.header.id;
    }
  }

  private async getDriveBySlugOrId(
    slugOrId: string,
  ): Promise<DocumentDriveDocument> {
    try {
      return await this.reactor.getDriveBySlug(slugOrId);
    } catch {
      const drive = await this.reactor.getDrive(slugOrId);
      return drive;
    }
  }

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
      drive: async (
        _: unknown,
        args: unknown,
        ctx: Context,
      ): Promise<DriveInfo> => {
        this.logger.verbose(`drive()`, JSON.stringify(args));

        if (!ctx.driveId) throw new Error("Drive ID is required");
        const drive = await this.getDriveBySlugOrId(ctx.driveId);

        return responseForDrive(drive);
      },
      documents: async (_: unknown, args: unknown, ctx: Context) => {
        this.logger.verbose(`documents(drive: ${ctx.driveId})`, args);
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const driveId = await this.getDriveIdBySlugOrId(ctx.driveId);
        const documents = await this.reactor.getDocuments(driveId);
        return documents;
      },
      document: async (_: unknown, { id }: { id: string }, ctx: Context) => {
        this.logger.verbose(`document(drive: ${ctx.driveId}, id: ${id})`);
        if (!ctx.driveId) throw new Error("Drive ID is required");

        const driveId = await this.getDriveIdBySlugOrId(ctx.driveId);

        if (id !== driveId) {
          const driveDocuments = await this.reactor.getDocuments(driveId);

          if (!driveDocuments.includes(id)) {
            throw new GraphQLError("Document is not part of this drive");
          }
        }
        const document = await this.reactor.getDocument(id);

        const dms = this.reactor.getDocumentModelModules();
        const dm = dms.find(
          ({ documentModel }) =>
            documentModel.id === document.header.documentType,
        );

        const globalState = document.state.global;
        if (!globalState)
          throw new Error("Document was found with no global state");

        const typeName = pascalCase(
          (dm?.documentModel.name || "").replaceAll("/", " "),
        );

        return responseForDocument(document, typeName);
      },
      system: () => ({ sync: {} }),
    },
    Mutation: {
      registerPullResponderListener: async (
        _: unknown,
        { filter, listenerId }: { filter: ListenerFilter; listenerId?: string },
        ctx: Context,
      ): Promise<ServerListener> => {
        this.logger.verbose(
          `registerPullResponderListener(drive: ${ctx.driveId})`,
          filter,
        );

        const isAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
        const isUser = ctx.isUser?.(ctx.user?.address ?? "");
        const isGuest = ctx.isGuest?.(ctx.user?.address ?? "");
        if (!isAdmin && !isUser && !isGuest) {
          throw new GraphQLError("Forbidden");
        }

        if (!ctx.driveId) {
          throw new Error("Drive ID is required");
        }
        const driveId = await this.getDriveIdBySlugOrId(ctx.driveId);

        // Create the listener and transmitter
        const uuid = listenerId ?? generateId();
        const listener: ServerListener = {
          driveId: driveId,
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
          await listenerManager.setListener(driveId, listener);
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
      ): Promise<ListenerRevision[]> => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const driveId = await this.getDriveIdBySlugOrId(ctx.driveId);
        this.logger.verbose(
          `pushUpdates(drive: slug:${ctx.driveId} id:${driveId})`,
          strandsGql,
        );

        const isAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
        const isUser = ctx.isUser?.(ctx.user?.address ?? "");
        if (!isAdmin && !isUser) {
          throw new GraphQLError("Forbidden");
        }

        // translate data types
        const strands: InternalStrandUpdate[] = strandsGql.map((strandGql) => {
          return {
            operations: strandGql.operations.map((op) => ({
              ...op,
              input: JSON.parse(op.input) as DocumentModelInput,
              skip: op.skip ?? 0,
              scope: strandGql.scope,
              branch: "main",
              action: {
                id: op.actionId,
                timestampUtcMs: op.timestampUtcMs,
                scope: strandGql.scope,
                type: op.type,
                input: JSON.parse(op.input) as DocumentModelInput,
              },
            })) as Operation[],
            documentId: strandGql.documentId,
            documentType: strandGql.documentType,
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
      ): Promise<boolean> => {
        if (!listenerId || !revisions) return false;
        if (!ctx.driveId) throw new Error("Drive ID is required");

        const driveId = await this.getDriveIdBySlugOrId(ctx.driveId);
        this.logger.verbose(
          `acknowledge(drive: ${ctx.driveId}/${driveId}, listenerId: ${listenerId})`,
          revisions,
        );

        // translate data types
        const validEntries = revisions
          .filter((r) => r !== null)
          .map((e) => ({
            driveId: e.driveId,
            documentId: e.documentId,
            documentType: e.documentType,
            scope: e.scope,
            branch: e.branch,
            revision: e.revision,
            status: e.status,
          }));

        // return a boolean indicating if the acknowledge was successful
        return await processAcknowledge(
          this.reactor,
          driveId,
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
      ): Promise<StrandUpdateGraphQL[]> => {
        if (!ctx.driveId) throw new Error("Drive ID is required");
        const driveId = await this.getDriveIdBySlugOrId(ctx.driveId);
        this.logger.verbose(
          `strands(drive: ${ctx.driveId}/${driveId}, listenerId: ${listenerId}, since:${since})`,
        );

        // get the requested strand updates
        const strands = await processGetStrands(
          this.reactor,
          driveId,
          listenerId,
          since,
        );

        // translate data types
        return strands.map((update) => ({
          driveId: update.driveId,
          documentId: update.documentId,
          documentType: update.documentType,
          scope: update.scope,
          branch: update.branch,
          operations: update.operations.map((op) => ({
            index: op.index,
            skip: op.skip,
            name: op.type,
            input: JSON.stringify(op.input),
            hash: op.hash,
            timestampUtcMs: op.timestampUtcMs,
            type: op.type,
            context: op.context,
            id: op.id,
            actionId: op.actionId,
          })),
        }));
      },
    },
  };
}
