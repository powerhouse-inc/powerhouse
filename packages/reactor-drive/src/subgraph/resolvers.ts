import type { IReactorClient } from "@powerhousedao/reactor";
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

/** A listing page stops scanning past this many times its limit once it serves a node. */
const LIST_SCAN_CAP_MULTIPLIER = 4;

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

/** The documents among `ids` a listing would serve; fails closed. */
async function servedIds(
  ctx: ReactorDriveResolverContext,
  ids: string[],
): Promise<Set<string>> {
  let asked = ids;
  if (ctx.hostCanRead) {
    const hostCanRead = ctx.hostCanRead;
    let allowed: boolean[];
    try {
      allowed = await Promise.all(
        ids.map((id) => hostCanRead(id, ctx.user?.address)),
      );
    } catch {
      return new Set();
    }
    asked = ids.filter((_, i) => allowed[i]);
  }
  if (asked.length === 0) {
    return new Set();
  }
  try {
    const documents = await ctx.reactorClient.find(
      { ids: asked },
      { subject: subjectOf(ctx) },
      { cursor: "0", limit: asked.length },
    );
    return new Set(documents.results.map((document) => document.header.id));
  } catch {
    return new Set();
  }
}

/** Whether each node is served, deciding every file node in one batch. */
async function servesNodes(
  ctx: ReactorDriveResolverContext,
  nodes: ReactorDriveNode[],
): Promise<boolean[]> {
  const ids = [
    ...new Set(
      nodes.filter((node) => node.kind === "file").map((node) => node.id),
    ),
  ];
  const served = ids.length > 0 ? await servedIds(ctx, ids) : new Set();
  return nodes.map((node) => node.kind === "folder" || served.has(node.id));
}

async function servedNodes(
  ctx: ReactorDriveResolverContext,
  nodes: ReactorDriveNode[],
): Promise<ReactorDriveNode[]> {
  const served = await servesNodes(ctx, nodes);
  return nodes.filter((_, i) => served[i]);
}

/**
 * One page of served children. It scans until the page is full, the listing
 * ends, or the scan cap is reached with something served, and resumes after
 * the last served node so a withheld node never names the cursor.
 */
async function listServedChildren(
  ctx: ReactorDriveResolverContext,
  driveId: string,
  parentFolder: string | null,
  paging: PagingInput | undefined,
  kind: NodeKindFilter,
) {
  const limit = paging?.limit ?? DEFAULT_LIMIT;
  const cap = limit * LIST_SCAN_CAP_MULTIPLIER;
  const wanted =
    kind === undefined ? undefined : kind === "FILE" ? "file" : "folder";
  const results: ReactorDriveNode[] = [];
  let anchor = paging?.cursor ?? "";
  let scanFrom = anchor;
  let scanned = 0;
  let hasMore: boolean;
  do {
    const page = await ctx.readModel.listChildren(
      driveId,
      parentFolder,
      { cursor: scanFrom, limit },
      undefined,
      wanted,
    );
    const served = await servesNodes(ctx, page.results);
    let i = 0;
    for (; i < page.results.length && results.length < limit; i++) {
      scanned++;
      scanFrom = page.cursors[i];
      if (served[i]) {
        results.push(page.results[i]);
        anchor = page.cursors[i];
      }
    }
    hasMore = i < page.results.length || page.nextCursor !== undefined;
  } while (
    hasMore &&
    results.length < limit &&
    (scanned < cap || results.length === 0)
  );
  return {
    results,
    nextCursor: hasMore ? anchor : undefined,
    hasMore,
  };
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
        return listServedChildren(ctx, parent.id, null, args.paging, args.kind);
      },
    },
    ReactorDriveFolderNode: {
      async children(
        parent: { id: string; driveId: string },
        args: { paging?: PagingInput; kind?: NodeKindFilter },
        context: ReactorDriveResolverContext,
      ) {
        const ctx = withBound(context);
        return listServedChildren(
          ctx,
          parent.driveId,
          parent.id,
          args.paging,
          args.kind,
        );
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
