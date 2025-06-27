import { type DocumentDriveDocument, type Node } from "document-drive";
import slug from "slug";

export const NOT_SET = "NOT_SET";

/* Will suspend until the atom is set elsewhere */
export function suspendUntilSet<T>(): Promise<T> {
  return new Promise(() => {});
}

export function makeDriveUrlComponent(
  drive: DocumentDriveDocument | undefined,
) {
  if (!drive) return "";
  return `/d/${slug(drive.header.slug)}`;
}

export function makeNodeUrlComponent(node: Node | undefined) {
  if (!node) return "";
  const nodeName = node.name;
  if (!nodeName) return slug(node.id);
  return slug(`${nodeName}-${node.id}`);
}

function extractNodeSlug(path: string) {
  const match = /^\/d\/[^/]+\/([^/]+)$/.exec(path);
  return match ? match[1] : undefined;
}
function findUuid(input: string | undefined | undefined) {
  if (!input) return undefined;
  const uuidRegex =
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
  const match = uuidRegex.exec(input);
  return match ? match[0] : undefined;
}

export function extractNodeFromPath(path: string) {
  const nodeSlug = extractNodeSlug(path);
  if (!nodeSlug) return undefined;
  const uuid = findUuid(nodeSlug);
  if (!uuid) return undefined;
  return uuid;
}

export function extractNodeNameOrSlugOrIdFromPath(path: string) {
  const nodeSlug = extractNodeSlug(path);
  const nodeId = findUuid(nodeSlug);
  if (nodeId) return nodeId;
  return nodeSlug;
}

export function extractDriveFromPath(path: string): string | null {
  const match = /^\/d\/([^/]+)/.exec(path);
  return match ? match[1] : null;
}

export function makeNodeSlugFromNodeName(name: string) {
  return name.replaceAll(/\s/g, "-");
}
