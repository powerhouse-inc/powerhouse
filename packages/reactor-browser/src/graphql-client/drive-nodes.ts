import type {
  DriveNodeKind,
  DriveNodePage,
  DriveNodeRecord,
  IDriveNodeSource,
  IDriveReadClient,
  PagedResults,
  PagingOptions,
} from "@powerhousedao/reactor";
import type {
  FileNode,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import {
  DriveNodeKind as GqlDriveNodeKind,
  type DriveNodeFieldsFragment,
  type Sdk,
} from "../graphql/gen/schema.js";

/** The node queries a {@link GraphQLDriveNodeSource} runs. */
export type DriveNodeQueries = Pick<
  Sdk,
  "GetDriveNodes" | "GetDriveNode" | "GetDriveDescendants"
>;

/** Page size {@link GraphQLDriveNodeSource.listAll} reads a drive in. */
const LIST_ALL_PAGE_LIMIT = 1000;

const DEFAULT_LIMIT = 100;

/**
 * The reactor subgraph's type-neutral node queries (`driveNodes`, `driveNode`,
 * `driveDescendants`) as an {@link IDriveNodeSource}, so a browser reads a
 * legacy drive and a reactor-drive alike. The Switchboard serves only the
 * nodes the caller may read. Drive ids must be canonical ids, not slugs.
 */
export class GraphQLDriveNodeSource implements IDriveNodeSource {
  constructor(
    private readonly queries: DriveNodeQueries,
    private readonly headersFor: (
      driveId: string,
    ) => Record<string, string> | undefined = () => undefined,
  ) {}

  async getNode(
    driveId: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<DriveNodeRecord | undefined> {
    const result = await this.queries.GetDriveNode(
      { driveId, id: nodeId },
      this.headersFor(driveId),
      signal,
    );
    return result.driveNode ? toRecord(result.driveNode) : undefined;
  }

  async listChildren(
    driveId: string,
    parentFolder: string | null | undefined,
    paging?: PagingOptions,
    signal?: AbortSignal,
    kind?: DriveNodeKind,
  ): Promise<DriveNodePage> {
    const cursor = startCursor(paging?.cursor);
    const result = await this.queries.GetDriveNodes(
      {
        driveId,
        ...(parentFolder === undefined ? {} : { parentFolder }),
        paging: paging ? { cursor, limit: paging.limit } : undefined,
        kind:
          kind === undefined
            ? undefined
            : kind === "file"
              ? GqlDriveNodeKind.File
              : GqlDriveNodeKind.Folder,
      },
      this.headersFor(driveId),
      signal,
    );
    const page = result.driveNodes;
    const nextCursor = page.hasMore
      ? (page.nextCursor ?? undefined)
      : undefined;
    return {
      results: page.results.map(toRecord),
      options: { cursor, limit: paging?.limit ?? DEFAULT_LIMIT },
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    };
  }

  async getDescendants(
    driveId: string,
    root: string,
    signal?: AbortSignal,
  ): Promise<DriveNodeRecord[]> {
    const result = await this.queries.GetDriveDescendants(
      { driveId, root },
      this.headersFor(driveId),
      signal,
    );
    return result.driveDescendants.map(toRecord);
  }

  async listAll(
    driveId: string,
    signal?: AbortSignal,
  ): Promise<DriveNodeRecord[]> {
    const nodes: DriveNodeRecord[] = [];
    let cursor = "";
    for (;;) {
      const page = await this.listChildren(
        driveId,
        undefined,
        { cursor, limit: LIST_ALL_PAGE_LIMIT },
        signal,
      );
      nodes.push(...page.results);
      if (page.nextCursor === undefined || page.nextCursor === cursor) {
        return nodes;
      }
      cursor = page.nextCursor;
    }
  }
}

/**
 * `read.drives` over a node source: the reactor's {@link IDriveReadClient},
 * answering in the legacy `Node` shape for every drive type.
 */
export class GraphQLDriveReadClient implements IDriveReadClient {
  constructor(private readonly nodes: IDriveNodeSource) {}

  async getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    const record = await this.nodes.getNode(driveIdentifier, nodeId, signal);
    if (!record) {
      throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
    }
    return toLegacyNode(record);
  }

  async listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>> {
    const page = await this.nodes.listChildren(
      driveIdentifier,
      parentFolder,
      paging,
      signal,
    );
    const nextCursor = page.nextCursor;
    return {
      results: page.results.map(toLegacyNode),
      options: page.options,
      ...(nextCursor !== undefined
        ? {
            nextCursor,
            next: () =>
              this.listNodes(
                driveIdentifier,
                parentFolder,
                { cursor: nextCursor, limit: page.options.limit },
                signal,
              ),
          }
        : {}),
    };
  }
}

/** A node record in the legacy `Node` shape. */
export function toLegacyNode(node: DriveNodeRecord): Node {
  if (node.kind === "file") {
    const file: FileNode = {
      id: node.id,
      kind: "file",
      name: node.name,
      parentFolder: node.parentFolder,
      documentType: node.documentType ?? "",
    };
    return file;
  }
  const folder: FolderNode = {
    id: node.id,
    kind: "folder",
    name: node.name,
    parentFolder: node.parentFolder,
  };
  return folder;
}

function toRecord(node: DriveNodeFieldsFragment): DriveNodeRecord {
  const base = {
    id: node.id,
    driveId: node.driveId,
    name: node.name,
    parentFolder: node.parentFolder ?? null,
  };
  return "documentType" in node
    ? { ...base, kind: "file", documentType: node.documentType }
    : { ...base, kind: "folder" };
}

/** The offset-style "0" other listings start from means the first page here too. */
function startCursor(cursor: string | undefined): string {
  return cursor === undefined || cursor === "0" ? "" : cursor;
}
