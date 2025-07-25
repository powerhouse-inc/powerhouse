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
export function makeNodeUrlComponent(node: Node | undefined) {
  if (!node) return "";
  const nodeName = node.name;
  if (!nodeName) return slug(node.id);
  return slug(`${nodeName}-${node.id}`);
}

/** Extracts the node slug from a path.
 *
 * The path is expected to be in the format `/d/<drive-slug>/<node-slug>`.
 */
function extractNodeSlug(path: string) {
  const match = /^\/d\/[^/]+\/([^/]+)$/.exec(path);
  return match ? match[1] : undefined;
}

/** Finds a UUID in a string, used for extracting node ids from node slugs in the URL. */
function findUuid(input: string | undefined | undefined) {
  if (!input) return undefined;
  const uuidRegex =
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
  const match = uuidRegex.exec(input);
  return match ? match[0] : undefined;
}

/** Extracts the node name, slug, or id from a path. */
export function extractNodeNameOrSlugOrIdFromPath(path: string) {
  const nodeSlug = extractNodeSlug(path);
  const nodeId = findUuid(nodeSlug);
  if (nodeId) return nodeId;
  return nodeSlug;
}

/** Extracts the drive slug from a path.
 * Used for extracting drive ids from drive slugs in the URL.
 * Expects the path to be in the format `/d/<drive-slug>`.
 */
export function extractDriveFromPath(path: string): string | null {
  const match = /^\/d\/([^/]+)/.exec(path);
  return match ? match[1] : null;
}

/** Legacy function that makes a slug from a node name.
 * Used for compatibility with the old URL structure in Connect.
 */
export function makeNodeSlugFromNodeName(name: string) {
  return name.replaceAll(/\s/g, "-");
}
