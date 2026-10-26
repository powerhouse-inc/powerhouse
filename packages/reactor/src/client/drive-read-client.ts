import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import type { ILogger } from "document-model";
import type { PagedResults, PagingOptions } from "../shared/types.js";
import { parsePagingOptions } from "../shared/utils.js";
import type { IDriveReadClient, IReactorReadClient } from "./types.js";

/** The read a {@link DriveReadClient} answers through. */
export type DriveReadDeps = Pick<IReactorReadClient, "get">;

/** Drive reads: a drive's nodes, served from the drive document as read. */
export class DriveReadClient implements IDriveReadClient {
  constructor(
    private readonly reads: DriveReadDeps,
    private readonly logger: ILogger,
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
}
