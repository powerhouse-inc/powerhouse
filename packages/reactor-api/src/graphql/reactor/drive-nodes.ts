import { GraphQLError } from "graphql";
import type {
  DriveNodeKind as DriveNodeRecordKind,
  DriveNodeRecord,
  IDriveNodeSource,
} from "@powerhousedao/reactor";
import { DriveNodeKind } from "./gen/graphql.js";

/**
 * The gate a node read passes, decided as the caller; it fails closed. A
 * drive's nodes are served to whoever may read the drive, as the legacy
 * drive document's node list was: a node carries a name, a type and a
 * parent, and the document behind a file node is still gated on its own
 * when it is opened. Gating each file node on its document cost one view
 * lookup per node, which made a listing of a large drive take seconds per
 * page.
 */
export type DriveNodeGate = {
  /** Whether the caller may read the drive. */
  servesDrive(driveId: string): Promise<boolean>;
};

export type DriveNodePagingInput = {
  readonly cursor?: string | null;
  readonly limit?: number | null;
};

export type DriveNodeListing = {
  results: DriveNodeRecord[];
  nextCursor: string | undefined;
  hasMore: boolean;
};

const DEFAULT_LIMIT = 100;

/** The node source, or the refusal a host without one answers with. */
export function requireDriveNodeSource(
  source: IDriveNodeSource | undefined,
): IDriveNodeSource {
  if (!source) {
    throw new GraphQLError(
      "Drive node queries are unavailable: no drive node source is configured on this server",
      { extensions: { code: "DRIVE_NODE_SOURCE_NOT_CONFIGURED" } },
    );
  }
  return source;
}

/** The GraphQL type of a node record, for the `DriveNode` union. */
export function driveNodeTypeName(
  node: object,
): "DriveFileNode" | "DriveFolderNode" {
  const kind = (node as { kind?: unknown }).kind;
  if (kind === "file" || kind === "folder") {
    return kind === "file" ? "DriveFileNode" : "DriveFolderNode";
  }
  return "documentType" in node ? "DriveFileNode" : "DriveFolderNode";
}

/** One node; undefined when absent or when the drive is withheld. */
export async function getServedNode(
  source: IDriveNodeSource,
  gate: DriveNodeGate,
  driveId: string,
  nodeId: string,
): Promise<DriveNodeRecord | undefined> {
  if (!(await gate.servesDrive(driveId))) {
    return undefined;
  }
  return source.getNode(driveId, nodeId);
}

/** The descendants of `root`; empty when the drive is withheld. */
export async function getServedDescendants(
  source: IDriveNodeSource,
  gate: DriveNodeGate,
  driveId: string,
  root: string,
): Promise<DriveNodeRecord[]> {
  if (!(await gate.servesDrive(driveId))) {
    return [];
  }
  return source.getDescendants(driveId, root);
}

/** One page of nodes; empty when the drive is withheld. */
export async function listServedNodes(
  source: IDriveNodeSource,
  gate: DriveNodeGate,
  driveId: string,
  parentFolder: string | null | undefined,
  paging: DriveNodePagingInput | null | undefined,
  kind: DriveNodeKind | null | undefined,
): Promise<DriveNodeListing> {
  if (!(await gate.servesDrive(driveId))) {
    return { results: [], nextCursor: undefined, hasMore: false };
  }
  const limit = paging?.limit ?? DEFAULT_LIMIT;
  const wanted: DriveNodeRecordKind | undefined = !kind
    ? undefined
    : kind === DriveNodeKind.File
      ? "file"
      : "folder";
  const page = await source.listChildren(
    driveId,
    parentFolder,
    { cursor: paging?.cursor ?? "", limit },
    undefined,
    wanted,
  );
  return {
    results: page.results,
    nextCursor: page.nextCursor,
    hasMore: page.nextCursor !== undefined,
  };
}
