import type { PagedResults, PagingOptions } from "@powerhousedao/reactor";
import type { ReactorDriveNode } from "../types.js";

/**
 * Drive-specific projection of the relationship graph. Reads from the
 * `DriveNode` and `DocumentName` tables maintained by `NodeProcessor`.
 *
 * All methods are pure reads; consumers responsible for read-after-write
 * consistency thread a `ConsistencyToken` to the underlying reactor read
 * model before calling these methods.
 */
export interface IDriveReadModel {
  getNode(
    driveId: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<ReactorDriveNode | undefined>;

  listChildren(
    driveId: string,
    parentFolder: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<ReactorDriveNode>>;

  /**
   * Returns every node reachable from `root` (inclusive) within the same
   * drive via parentFolder chains. Useful for cascade delete and copy.
   */
  getDescendants(
    driveId: string,
    root: string,
    signal?: AbortSignal,
  ): Promise<ReactorDriveNode[]>;

  /**
   * Returns every node in the drive, unpaged. Intended for hydrating the
   * legacy `state.global.nodes` representation when returning drive
   * documents to legacy consumers.
   */
  listAll(driveId: string, signal?: AbortSignal): Promise<ReactorDriveNode[]>;
}
