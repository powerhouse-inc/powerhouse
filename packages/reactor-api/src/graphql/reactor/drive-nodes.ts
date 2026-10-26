import { GraphQLError } from "graphql";
import type {
  DriveNodeKind as DriveNodeRecordKind,
  DriveNodeRecord,
  IDriveNodeSource,
} from "@powerhousedao/reactor";
import { DriveNodeKind } from "./gen/graphql.js";

/** The gate a node read passes, decided as the caller. Each fails closed. */
export type DriveNodeGate = {
  /** Whether the caller may read the drive. */
  servesDrive(driveId: string): Promise<boolean>;
  /** The documents among `ids` the caller may read. */
  servedDocuments(ids: string[]): Promise<Set<string>>;
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

/** A listing page stops scanning past this many times its limit once it serves a node. */
const LIST_SCAN_CAP_MULTIPLIER = 4;

/** Documents per read-gate call, keeping each `find` well under the bind limit. */
export const SERVED_IDS_CHUNK = 1000;

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

/** One node; undefined when absent, or when the drive or its document is withheld. */
export async function getServedNode(
  source: IDriveNodeSource,
  gate: DriveNodeGate,
  driveId: string,
  nodeId: string,
): Promise<DriveNodeRecord | undefined> {
  if (!(await gate.servesDrive(driveId))) {
    return undefined;
  }
  const node = await source.getNode(driveId, nodeId);
  if (!node) {
    return undefined;
  }
  const [served] = await servesNodes(gate, [node]);
  return served ? node : undefined;
}

/** The descendants of `root` the caller may read; empty when the drive is withheld. */
export async function getServedDescendants(
  source: IDriveNodeSource,
  gate: DriveNodeGate,
  driveId: string,
  root: string,
): Promise<DriveNodeRecord[]> {
  if (!(await gate.servesDrive(driveId))) {
    return [];
  }
  const nodes = await source.getDescendants(driveId, root);
  const served = await servesNodes(gate, nodes);
  return nodes.filter((_, i) => served[i]);
}

/**
 * One page of served nodes. It scans until the page is full, the listing
 * ends, or the scan cap is reached with something served, and resumes after
 * the last served node so a withheld node never names the cursor. A source
 * that reports no per-node cursors is read one page at a time.
 */
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
  const cap = limit * LIST_SCAN_CAP_MULTIPLIER;
  const wanted: DriveNodeRecordKind | undefined = !kind
    ? undefined
    : kind === DriveNodeKind.File
      ? "file"
      : "folder";
  const results: DriveNodeRecord[] = [];
  let anchor = paging?.cursor ?? "";
  let scanFrom = anchor;
  let scanned = 0;
  let hasMore: boolean;
  let advanced: boolean;
  do {
    const from = scanFrom;
    const page = await source.listChildren(
      driveId,
      parentFolder,
      { cursor: scanFrom, limit },
      undefined,
      wanted,
    );
    const served = await servesNodes(gate, page.results);
    if (!page.cursors) {
      return {
        results: page.results.filter((_, i) => served[i]),
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== undefined,
      };
    }
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
    advanced = scanFrom !== from;
  } while (
    advanced &&
    hasMore &&
    results.length < limit &&
    (scanned < cap || results.length === 0)
  );
  return { results, nextCursor: hasMore ? anchor : undefined, hasMore };
}

/** A file node names its document, so it is served only with that document. */
async function servesNodes(
  gate: DriveNodeGate,
  nodes: DriveNodeRecord[],
): Promise<boolean[]> {
  const ids = [
    ...new Set(
      nodes.filter((node) => node.kind === "file").map((node) => node.id),
    ),
  ];
  const served = ids.length > 0 ? await gate.servedDocuments(ids) : new Set();
  return nodes.map((node) => node.kind === "folder" || served.has(node.id));
}
