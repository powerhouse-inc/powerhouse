import type { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";
import type {
  Context,
  GqlDriveDocument,
  GqlOperation,
  InternalStrandUpdate,
  SubgraphArgs,
} from "@powerhousedao/reactor-api";
import { pascalCase } from "change-case";
import type {
  DocumentDriveDocument,
  DriveInfo,
  FileNode,
  ListenerFilter,
  ListenerRevision,
  Node,
  ServerListener,
  StrandUpdateGraphQL,
} from "document-drive";
import {
  childLogger,
  PullResponderTransmitter,
  responseForDocument,
  responseForDrive,
} from "document-drive";
import type { DocumentModelInput, Operation } from "document-model";
import { generateId } from "document-model/core";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import {
  processAcknowledge,
  processGetStrands,
  processPushUpdate,
} from "../sync/utils.js";
import { BaseSubgraph } from "./base-subgraph.js";
import type { Asset } from "./temp-hack-rwa-type-defs.js";
import { buildGraphQlDriveDocument, IDocumentGraphql } from "./utils.js";

const driveKindTypeNames: Record<string, string> = {
  file: "DocumentDrive_FileNode",
  folder: "DocumentDrive_FolderNode",
};

export const DocumentDriveResolvers = {
  DocumentDrive_Node: {
    __resolveType: (obj: FileNode) => {
      return obj.documentType
        ? driveKindTypeNames.file
        : driveKindTypeNames.folder;
    },
  },
  DocumentDrive: {
    operations: IDocumentGraphql.resolvers.IDocument.operations,
  },
};

export class DriveSubgraph extends BaseSubgraph {
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
    extend type DocumentDrive {
      meta: DriveMeta
      slug: String!
    }

    type Query {
      system: System
      drive: DriveInfo
      driveDocument: DocumentDrive
      document(id: String!): DriveDocument
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
    Operation: {
      type: (operation: Operation | GqlOperation) =>
        "type" in operation ? operation.type : operation.action.type,
      id: (operation: Operation | GqlOperation) => operation.id,
    },
    DriveDocument: {
      operations: IDocumentGraphql.resolvers.IDocument.operations,
    },
    ...DocumentDriveResolvers,
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
      driveDocument: async (
        _: unknown,
        args: unknown,
        ctx: Context,
      ): Promise<GqlDriveDocument> => {
        this.logger.verbose(`driveDocument()`, JSON.stringify(args));

        if (!ctx.driveId) throw new Error("Drive ID is required");
        const drive = await this.getDriveBySlugOrId(ctx.driveId);
        ctx.document = drive;
        return buildGraphQlDriveDocument(drive);
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
            documentModel.global.id === document.header.documentType,
        );

        let node: Node | undefined;
        const driveDocument = await this.reactor.getDrive(driveId);
        if (driveDocument?.state?.global?.nodes) {
          node = driveDocument.state.global.nodes.find(
            (node) => node.id === id,
          );
        }

        // eslint-disable-next-line
        const globalState = (document.state as any).global;
        if (!globalState)
          throw new Error("Document was found with no global state");

        const typeName = pascalCase(
          (dm?.documentModel.global.name || "").replaceAll("/", " "),
        );

        return responseForDocument(document, typeName, node?.name);
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

        if (!ctx.driveId) {
          throw new Error("Drive ID is required");
        }
        const reactorDriveId = await this.getDriveIdBySlugOrId(ctx.driveId);

        // Check global roles first
        const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
        const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
        const isGlobalGuest =
          ctx.isGuest?.(ctx.user?.address ?? "") ||
          process.env.FREE_ENTRY === "true";

        // If user has a global role, allow access
        const hasGlobalAccess = isGlobalAdmin || isGlobalUser || isGlobalGuest;

        // If no global access, check document-level permissions
        if (!hasGlobalAccess && this.documentPermissionService) {
          const canRead = await this.documentPermissionService.canReadDocument(
            reactorDriveId,
            ctx.user?.address,
          );

          if (!canRead) {
            this.logger.warn(
              `registerPullResponderListener rejected: user ${ctx.user?.address ?? "anonymous"} lacks read permission for drive ${reactorDriveId}`,
            );
            throw new GraphQLError(
              "Forbidden: insufficient permissions to read from this drive",
            );
          }
        } else if (!hasGlobalAccess) {
          throw new GraphQLError("Forbidden");
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

        // Check global roles first (write requires admin or user, not guest)
        const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
        const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");

        // If user has global write access, allow
        const hasGlobalWriteAccess = isGlobalAdmin || isGlobalUser;

        // If no global write access, check document-level permissions
        if (!hasGlobalWriteAccess && this.documentPermissionService) {
          const canWrite =
            await this.documentPermissionService.canWriteDocument(
              driveId,
              ctx.user?.address,
            );

          if (!canWrite) {
            this.logger.warn(
              `pushUpdates rejected: user ${ctx.user?.address ?? "anonymous"} lacks write permission for drive ${driveId}`,
            );
            throw new GraphQLError(
              "Forbidden: insufficient permissions to write to this drive",
            );
          }
        } else if (!hasGlobalWriteAccess) {
          throw new GraphQLError("Forbidden");
        }

        // translate data types
        const strands: InternalStrandUpdate[] = strandsGql.map((strandGql) => {
          return {
            operations: strandGql.operations.map((op) => ({
              index: op.index,
              skip: op.skip ?? 0,
              timestampUtcMs: op.timestampUtcMs,
              hash: op.hash,
              id: op.id,
              // Map GraphQL context to Action.context (only signer is defined in schema)
              action: {
                id: op.actionId,
                type: op.type,
                timestampUtcMs: op.timestampUtcMs,
                scope: strandGql.scope,
                input: JSON.parse(op.input) as DocumentModelInput,
                context: op.context,
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

        // Check global roles first
        const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
        const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
        const isGlobalGuest =
          ctx.isGuest?.(ctx.user?.address ?? "") ||
          process.env.FREE_ENTRY === "true";

        // If user has a global role, allow access
        const hasGlobalAccess = isGlobalAdmin || isGlobalUser || isGlobalGuest;

        // If no global access, check document-level permissions
        if (!hasGlobalAccess && this.documentPermissionService) {
          const canRead = await this.documentPermissionService.canReadDocument(
            driveId,
            ctx.user?.address,
          );

          if (!canRead) {
            this.logger.warn(
              `strands filtered: user ${ctx.user?.address ?? "anonymous"} lacks read permission for drive ${driveId}`,
            );
            return []; // Return empty for drives without permission
          }
        } else if (!hasGlobalAccess) {
          return []; // Return empty if no access
        }

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
            // no extra name field; GraphQL schema exposes `type`
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
