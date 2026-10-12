import type { PagedResults, PagingOptions } from "@powerhousedao/reactor";
import type { ReactorDriveNode } from "../types.js";

/** A page of nodes with, for each node, the cursor that resumes after it. */
export type DriveNodePage = PagedResults<ReactorDriveNode> & {
  cursors: string[];
};

/**
 * Drive-specific projection of the relationship graph. Reads from the
 * `DriveNode` and `DocumentName` tables maintained by `NodeProcessor`.
 *
 * All methods are eventually-consistent reads against the projection.
 * Callers that need read-after-write consistency must coordinate at the
 * client layer (e.g. via `IReactorClient.waitForConsistency`) before
 * invoking these methods.
 */
export interface IDriveReadModel {
  getNode(
    driveId: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<ReactorDriveNode | undefined>;

  /**
   * Lists nodes within a drive with optional filtering by parent folder.
   *
   * - `parentFolder === undefined` returns every node in the drive.
   * - `parentFolder === null` returns only root-level nodes.
   * - `parentFolder === <id>` returns only direct children of that folder.
   * - `kind` keeps only nodes of that kind.
   */
  listChildren(
    driveId: string,
    parentFolder: string | null | undefined,
    paging?: PagingOptions,
    signal?: AbortSignal,
    kind?: ReactorDriveNode["kind"],
  ): Promise<DriveNodePage>;

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
