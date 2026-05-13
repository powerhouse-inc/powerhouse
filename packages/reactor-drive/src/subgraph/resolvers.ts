import type {
  ConsistencyToken,
  IReactorClient,
  PagedResults,
  PagingOptions,
} from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { REACTOR_DRIVE_DOCUMENT_TYPE } from "../constants.js";
import type { IDriveReadModel } from "../read-model/interfaces.js";
import type { ReactorDrivePHState, ReactorDriveNode } from "../types.js";

export interface ReactorDriveResolverContext {
  reactorClient: IReactorClient;
  readModel: IDriveReadModel;
  consistencyToken?: ConsistencyToken;
}

type PagingInput = { cursor?: string; limit?: number };
type NodeKindFilter = "FILE" | "FOLDER" | undefined;

const DEFAULT_LIMIT = 100;

function toPaging(input: PagingInput | undefined): PagingOptions | undefined {
  if (!input) return undefined;
  return {
    cursor: input.cursor ?? "",
    limit: input.limit ?? DEFAULT_LIMIT,
  };
}

function filterByKind(
  page: PagedResults<ReactorDriveNode>,
  kind: NodeKindFilter,
): PagedResults<ReactorDriveNode> {
  if (!kind) return page;
  const wanted = kind === "FILE" ? "file" : "folder";
  return {
    ...page,
    results: page.results.filter((node) => node.kind === wanted),
  };
}

function shapePage(page: PagedResults<ReactorDriveNode>) {
  return {
    results: page.results,
    nextCursor: page.nextCursor,
    hasMore: page.nextCursor !== undefined,
    totalCount: page.totalCount,
  };
}

/**
 * Builds GraphQL resolvers backed by the drive read model. The resolvers are
 * pure — every external dependency is read off the GraphQL context. Wiring
 * the resolvers into a subgraph (e.g. `reactor-api`'s `ISubgraph`) is the
 * caller's responsibility.
 */
export function createReactorDriveResolvers() {
  return {
    Query: {
      async reactorDrive(
        _root: unknown,
        args: { id: string },
        ctx: ReactorDriveResolverContext,
      ) {
        const document = await ctx.reactorClient.get<
          PHDocument<ReactorDrivePHState>
        >(args.id);
        if (document.header.documentType !== REACTOR_DRIVE_DOCUMENT_TYPE) {
          return null;
        }
        return {
          id: document.header.id,
          name: document.state.global.name,
          icon: document.state.global.icon,
          sharingType: document.state.local.sharingType,
          availableOffline: document.state.local.availableOffline,
        };
      },
      async reactorDriveNode(
        _root: unknown,
        args: { driveId: string; id: string },
        ctx: ReactorDriveResolverContext,
      ) {
        return ctx.readModel.getNode(args.driveId, args.id);
      },
      async reactorDriveDescendants(
        _root: unknown,
        args: { driveId: string; root: string },
        ctx: ReactorDriveResolverContext,
      ) {
        return ctx.readModel.getDescendants(args.driveId, args.root);
      },
    },
    ReactorDrive: {
      async rootNodes(
        parent: { id: string },
        args: { paging?: PagingInput; kind?: NodeKindFilter },
        ctx: ReactorDriveResolverContext,
      ) {
        const page = await ctx.readModel.listChildren(
          parent.id,
          null,
          toPaging(args.paging),
        );
        return shapePage(filterByKind(page, args.kind));
      },
    },
    ReactorDriveFolderNode: {
      async children(
        parent: { id: string; driveId: string },
        args: { paging?: PagingInput; kind?: NodeKindFilter },
        ctx: ReactorDriveResolverContext,
      ) {
        const page = await ctx.readModel.listChildren(
          parent.driveId,
          parent.id,
          toPaging(args.paging),
        );
        return shapePage(filterByKind(page, args.kind));
      },
    },
    ReactorDriveNode: {
      __resolveType(node: ReactorDriveNode) {
        return node.kind === "file"
          ? "ReactorDriveFileNode"
          : "ReactorDriveFolderNode";
      },
    },
  };
}
