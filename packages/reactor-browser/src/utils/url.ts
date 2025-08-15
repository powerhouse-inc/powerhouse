import { type DocumentDriveDocument, type Node } from "document-drive";
import slug from "slug";

/** Makes a URL component for a drive. */
export function makeDriveUrlComponent(
  drive: DocumentDriveDocument | undefined,
) {
  if (!drive) return "";
  return `/d/${slug(drive.header.slug)}`;
}

/** Makes a URL component for a node. */
export function makeNodeSlug(node: Node | undefined) {
  if (!node) return "";
  const nodeName = node.name;
  if (!nodeName) return slug(node.id);
  return slug(`${nodeName}-${node.id}`);
}

/** Extracts the node slug from a path.
 *
 * The path is expected to be in the format `/d/<drive-slug>/<node-slug>`.
 */
export function extractNodeSlugFromPath(path: string) {
  const match = /^\/d\/[^/]+\/([^/]+)$/.exec(path);
  return match?.[1] ?? "";
}

/** Finds a UUID in a string, used for extracting node ids from node slugs in the URL. */
export function findUuid(input: string | undefined) {
  if (!input) return undefined;
  const uuidRegex =
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
  const match = uuidRegex.exec(input);
  return match?.[0];
}

export function extractNodeIdFromSlug(nodeSlug: string | undefined) {
  const nodeId = findUuid(nodeSlug);
  return nodeId;
}

export function extractNodeIdFromPath(path: string) {
  const nodeSlug = extractNodeSlugFromPath(path);
  const nodeId = extractNodeIdFromSlug(nodeSlug);
  return nodeId;
}

/** Extracts the drive slug from a path.
 * Used for extracting drive ids from drive slugs in the URL.
 * Expects the path to be in the format `/d/<drive-slug>`.
 */
export function extractDriveSlugFromPath(path: string) {
  const match = /^\/d\/([^/]+)/.exec(path);
  return match?.[1] ?? "";
}

export function extractDriveIdFromSlug(driveSlug: string | undefined) {
  const driveId = findUuid(driveSlug);
  return driveId;
}

export function extractDriveIdFromPath(path: string) {
  const driveSlug = extractDriveSlugFromPath(path);
  const driveId = extractDriveIdFromSlug(driveSlug);
  return driveId;
}
