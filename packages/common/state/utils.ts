import { type DocumentDriveDocument, type Node } from "document-drive";
import slug from "slug";
import { type Reactor } from "./types.js";

/** Sentinel value for atoms that are not set. */
export const NOT_SET = "NOT_SET";

/* Will suspend until the atom is set elsewhere.
 * Returns a promise that will never resolve of type T.
 *
 * Makes use of Jotai's "async forever" pattern as described here https://jotai.org/docs/guides/async#async-forever
 */
export function suspendUntilSet<T>(): Promise<T> {
  return new Promise(() => {});
}

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

/** Extracts the node id from a path. */
export function extractNodeFromPath(path: string) {
  const nodeSlug = extractNodeSlug(path);
  if (!nodeSlug) return undefined;
  const uuid = findUuid(nodeSlug);
  if (!uuid) return undefined;
  return uuid;
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

/** Sets the selected drive and node from the URL.
 *
 * Both the selected drive id and selected node id begin in the NOT_SET state, so they will suspend unless set by this function or another implementation.
 *
 * If the URL is in the format `/d/<drive-slug>`, the selected drive will be set.
 * If the URL is in the format `/d/<drive-slug>/<node-slug>`, the selected drive and node will be set.
 */
export async function setSelectedDriveAndNodeFromUrl(
  reactor: Reactor | undefined,
  setSelectedDrive: (driveId: string | undefined) => void,
  setSelectedNode: (nodeId: string | undefined) => void,
  shouldNavigate: boolean,
) {
  if (typeof window === "undefined") return;
  if (!shouldNavigate) return;
  if (!reactor) return;

  const path = window.location.pathname;
  const drive = await handleDriveFromUrl(reactor, path, setSelectedDrive);

  handleNodeFromUrl(drive, path, setSelectedNode);
}

async function handleDriveFromUrl(
  reactor: Reactor,
  path: string,
  setSelectedDrive: (driveId: string | undefined) => void,
) {
  const driveSlug = extractDriveFromPath(path);
  const driveIds = await reactor.getDrives();
  if (!driveIds) return;
  const drives = (
    await Promise.all(driveIds.map((id) => reactor.getDrive(id)))
  ).filter((d) => d !== undefined);
  const drive = drives.find(
    (d) => d.header.slug === driveSlug || d.header.id === driveSlug,
  );
  setSelectedDrive(drive?.header.id);

  return drive;
}

function handleNodeFromUrl(
  drive: DocumentDriveDocument | undefined,
  path: string,
  setSelectedNode: (nodeId: string | undefined) => void,
) {
  const nodeIdOrSlugOrNameFromPath = extractNodeNameOrSlugOrIdFromPath(path);
  const nodes = drive?.state.global.nodes;
  const node = nodes?.find(
    (n) =>
      n.id === nodeIdOrSlugOrNameFromPath ||
      makeNodeSlugFromNodeName(n.name) === nodeIdOrSlugOrNameFromPath,
  );
  setSelectedNode(node?.id);
}
