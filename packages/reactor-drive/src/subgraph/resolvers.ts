import type {
  IReactorClient,
  PagedResults,
  PagingOptions,
} from "@powerhousedao/reactor";
import type {
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { REACTOR_DRIVE_DOCUMENT_TYPE } from "../constants.js";
import type { IDriveReadModel } from "../read-model/interfaces.js";
import type { ReactorDrivePHState, ReactorDriveNode } from "../types.js";

export interface ReactorDriveResolverContext {
  reactorClient: IReactorClient;
  readModel: IDriveReadModel;
  /** The authenticated caller; absent reads as anonymous, never the host. */
  user?: { address?: string; appKey?: string };
  /** The host's own read check, applied on top of the reactor's read gate. */
  hostCanRead?: (documentId: string, address?: string) => Promise<boolean>;
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

function subjectOf(ctx: ReactorDriveResolverContext): AuthSubject {
  return { address: ctx.user?.address, key: ctx.user?.appKey };
}

/** Whether a listing would serve the document to the caller; fails closed. */
async function serves(
  ctx: ReactorDriveResolverContext,
  documentId: string,
): Promise<boolean> {
  try {
    if (
      ctx.hostCanRead &&
      !(await ctx.hostCanRead(documentId, ctx.user?.address))
    ) {
      return false;
    }
    return await ctx.reactorClient.isServed(documentId, {
      subject: subjectOf(ctx),
    });
  } catch {
    return false;
  }
}

/** A file node names its document, so it is served only with that document. */
async function servesNode(
  ctx: ReactorDriveResolverContext,
  node: ReactorDriveNode,
): Promise<boolean> {
  return node.kind === "folder" || serves(ctx, node.id);
}

async function servedNodes(
  ctx: ReactorDriveResolverContext,
  nodes: ReactorDriveNode[],
): Promise<ReactorDriveNode[]> {
  const served = await Promise.all(nodes.map((node) => servesNode(ctx, node)));
  return nodes.filter((_, i) => served[i]);
}

async function servedPage(
  ctx: ReactorDriveResolverContext,
  page: PagedResults<ReactorDriveNode>,
): Promise<PagedResults<ReactorDriveNode>> {
  return { ...page, results: await servedNodes(ctx, page.results) };
}

/**
 * Builds GraphQL resolvers backed by the drive read model. Dependencies are
 * read off the GraphQL context unless bound here. Every read is decided as the
 * caller: a drive's nodes are its content, so they are served only with the
 * drive, and a file node only with its own document too.
 */
export function createReactorDriveResolvers(
  bound: Omit<Partial<ReactorDriveResolverContext>, "user"> = {},
) {
  const withBound = (
    ctx: ReactorDriveResolverContext,
  ): ReactorDriveResolverContext => ({ ...ctx, ...bound, user: ctx.user });

  return {
    Query: {
      async reactorDrive(
        _root: unknown,
        args: { id: string },
        context: ReactorDriveResolverContext,
      ) {
        const ctx = withBound(context);
        const document = await ctx.reactorClient.get<
          PHDocument<ReactorDrivePHState>
        >(args.id, { subject: subjectOf(ctx) });
        if (document.header.documentType !== REACTOR_DRIVE_DOCUMENT_TYPE) {
          return null;
        }
        if (!(await serves(ctx, document.header.id))) {
          return null;
        }
        const { global, local } = document.state as Partial<
          PHDocument<ReactorDrivePHState>["state"]
        >;
        if (!global) {
          return null;
        }
        return {
          id: document.header.id,
          name: global.name,
          icon: global.icon,
          sharingType: local?.sharingType ?? null,
          availableOffline: local?.availableOffline ?? null,
        };
      },
      async reactorDriveNode(
        _root: unknown,
        args: { driveId: string; id: string },
        context: ReactorDriveResolverContext,
      ) {
        const ctx = withBound(context);
        if (!(await serves(ctx, args.driveId))) {
          return undefined;
        }
        const node = await ctx.readModel.getNode(args.driveId, args.id);
        if (!node || !(await servesNode(ctx, node))) {
          return undefined;
        }
        return node;
      },
      async reactorDriveDescendants(
        _root: unknown,
        args: { driveId: string; root: string },
        context: ReactorDriveResolverContext,
      ) {
        const ctx = withBound(context);
        if (!(await serves(ctx, args.driveId))) {
          return [];
        }
        return servedNodes(
          ctx,
          await ctx.readModel.getDescendants(args.driveId, args.root),
        );
      },
    },
    ReactorDrive: {
      async rootNodes(
        parent: { id: string },
        args: { paging?: PagingInput; kind?: NodeKindFilter },
        context: ReactorDriveResolverContext,
      ) {
        const ctx = withBound(context);
        const page = await ctx.readModel.listChildren(
          parent.id,
          null,
          toPaging(args.paging),
        );
        return shapePage(await servedPage(ctx, filterByKind(page, args.kind)));
      },
    },
    ReactorDriveFolderNode: {
      async children(
        parent: { id: string; driveId: string },
        args: { paging?: PagingInput; kind?: NodeKindFilter },
        context: ReactorDriveResolverContext,
      ) {
        const ctx = withBound(context);
        const page = await ctx.readModel.listChildren(
          parent.driveId,
          parent.id,
          toPaging(args.paging),
        );
        return shapePage(await servedPage(ctx, filterByKind(page, args.kind)));
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
