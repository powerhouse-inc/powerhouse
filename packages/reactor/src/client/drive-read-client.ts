import type {
  DocumentDriveDocument,
  FileNode,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type { ILogger } from "document-model";
import type { PagedResults, PagingOptions } from "../shared/types.js";
import { parsePagingOptions } from "../shared/utils.js";
import type { DriveNodeRecord, IDriveNodeSource } from "./drive-nodes.js";
import type { IDriveReadClient, IReactorReadClient } from "./types.js";

/** The read a {@link DriveReadClient} answers through. */
export type DriveReadDeps = Pick<IReactorReadClient, "get">;

/** A node record in the legacy `Node` shape the drive read client returns. */
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

/**
 * Drive reads: a drive's nodes. With a node source, they are served from it
 * for every drive type, and the drive is read only for its header (its id and
 * its existence); without one, from the drive document as read.
 */
export class DriveReadClient implements IDriveReadClient {
  constructor(
    private readonly reads: DriveReadDeps,
    private readonly logger: ILogger,
    private readonly nodes?: IDriveNodeSource,
  ) {}

  async getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    this.logger.verbose(
      "drives.getNode(@driveIdentifier, @nodeId)",
      driveIdentifier,
      nodeId,
    );
    if (this.nodes) {
      const driveId = await this.resolveDriveId(driveIdentifier, signal);
      const record = await this.nodes.getNode(driveId, nodeId, signal);
      if (!record) {
        throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
      }
      return toLegacyNode(record);
    }
    const drive = await this.reads.get<DocumentDriveDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    const node = drive.state.global.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
    }
    return node;
  }

  async listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>> {
    this.logger.verbose(
      "drives.listNodes(@driveIdentifier, @parentFolder, @paging)",
      driveIdentifier,
      parentFolder,
      paging,
    );
    if (this.nodes) {
      const driveId = await this.resolveDriveId(driveIdentifier, signal);
      const page = await this.nodes.listChildren(
        driveId,
        parentFolder,
        paging,
        signal,
      );
      return {
        results: page.results.map(toLegacyNode),
        options: page.options,
        ...(page.nextCursor !== undefined
          ? { nextCursor: page.nextCursor }
          : {}),
      };
    }
    const drive = await this.reads.get<DocumentDriveDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    const allNodes = drive.state.global.nodes;
    const filtered =
      parentFolder === undefined
        ? [...allNodes]
        : allNodes.filter((n) => (n.parentFolder ?? null) === parentFolder);

    const { offset: startIndex, limit } = parsePagingOptions(
      paging,
      filtered.length,
    );
    const effective: PagingOptions = paging ?? { cursor: "", limit };
    const endIndex = startIndex + limit;
    const slice = filtered.slice(startIndex, endIndex);
    const hasMore = endIndex < filtered.length;

    return {
      results: slice,
      options: effective,
      ...(hasMore ? { nextCursor: String(endIndex) } : {}),
    };
  }

  /**
   * The drive's id, from a read of its document scope alone: a slug resolves,
   * a missing drive throws as the state-reading path does, and the drive's
   * global state (the legacy node tree) is never loaded.
   */
  private async resolveDriveId(
    driveIdentifier: string,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const drive = await this.reads.get(
      driveIdentifier,
      { scopes: ["document"] },
      signal,
    );
    return drive.header.id;
  }
}
