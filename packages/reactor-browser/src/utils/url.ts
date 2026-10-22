import { getPHStore } from "../hooks/ph-store.js";
import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import { isDerivedDocumentId } from "@powerhousedao/shared/document-model";
import slug from "slug";

// Length of the base64url id a v2-required document gets.
const DERIVED_ID_LENGTH = 43;

// Returns url with base path plus provided path
export function resolveUrlPathname(path: string) {
  return new URL(
    path.replace(/^\/+/, ""),
    window.location.origin + (getPHStore()?.basePath ?? "/"),
  ).pathname;
}

/** Returns the path without a leading base path */
export function getPathWithoutBase(path: string) {
  const basePath = getPHStore()?.basePath ?? "/";
  if (!path.startsWith(basePath)) return path;
  const rest = path.slice(basePath.length);
  if (basePath.endsWith("/")) return `/${rest}`;
  return rest === "" || rest.startsWith("/") ? rest : path;
}

/** Makes a URL component for a drive.
 * @deprecated Open drives through the store's `navigation`; it builds the path. */
export function makeDriveUrlComponent(
  drive: DocumentDriveDocument | undefined,
) {
  if (!drive) return "";
  return `/d/${slug(drive.header.slug)}`;
}

/** A drive's URL component: its slug, else its id, prefixed with the slugged
 * name as `<name>-<id>` when the id is opaque (a UUID or derived id). */
export function makeDriveSlug(drive: DocumentDriveDocument): string {
  const { id, slug: driveSlug } = drive.header;
  if (driveSlug && driveSlug !== id) return driveSlug;
  return isOpaqueId(id) ? namedDriveSlug(drive) : id;
}

function isOpaqueId(id: string) {
  return findUuid(id) !== undefined || isDerivedDocumentId(id);
}

function namedDriveSlug(drive: DocumentDriveDocument): string {
  const name = drive.state.global.name || drive.header.name;
  return namedSlug(drive, name, drive.header.id);
}

const namedSlugs = new WeakMap<
  object,
  { name: string; id: string; value: string }
>();

// `<slugged name>-<id>`, cached per drive or node; inputs are rechecked.
function namedSlug(owner: object, name: string, id: string): string {
  const cached = namedSlugs.get(owner);
  if (cached?.name === name && cached.id === id) return cached.value;
  const nameSlug = name ? slug(name) : "";
  const value = nameSlug ? `${nameSlug}-${id}` : id;
  namedSlugs.set(owner, { name, id, value });
  return value;
}

/** The drive a URL slug names: its own slug, its id, or `<name>-<id>`. */
export function findDriveBySlug(
  drives: readonly DocumentDriveDocument[] | undefined,
  ref: string | undefined,
): DocumentDriveDocument | undefined {
  if (!drives || !ref) return undefined;
  const exact = drives.find(
    (d) => d.header.slug === ref || d.header.id === ref,
  );
  if (exact) return exact;
  const id = extractDriveIdFromSlug(ref);
  if (id !== undefined) {
    const byId = drives.find((d) => d.header.id === id);
    if (byId) return byId;
  }
  // `<name>-<id>` also for a readable id, as older links wrote it.
  return drives.find(
    (d) =>
      (!d.header.slug || d.header.slug === d.header.id) &&
      ref.endsWith(d.header.id) &&
      namedDriveSlug(d) === ref,
  );
}

/**
 * Makes a URL component for a node: `<slugged name>-<id>`. The id is kept
 * verbatim, since a v2-required id is case-sensitive base64url.
 */
export function makeNodeSlug(node: Node | undefined): string {
  if (!node) return "";
  return namedSlug(node, node.name, node.id);
}

/** Extracts the node slug from a path.
 *
 * The path is expected to be in the format `/d/<drive-slug>/<node-slug>`.
 */
export function extractNodeSlugFromPath(path: string) {
  const currentPath = getPathWithoutBase(path);
  const match = /^\/d\/[^/]+\/([^/]+)$/.exec(currentPath);
  return match?.[1];
}

/** Finds a UUID in a string, used for extracting node ids from node slugs in the URL. */
export function findUuid(input: string | undefined) {
  if (!input) return undefined;
  const uuidRegex =
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
  const match = uuidRegex.exec(input);
  return match?.[0];
}

/** The v2-required document id a slug ends with, if any. */
export function findDerivedId(input: string | undefined) {
  if (!input || input.length < DERIVED_ID_LENGTH) return undefined;
  const start = input.length - DERIVED_ID_LENGTH;
  if (start > 0 && input[start - 1] !== "-") return undefined;
  const candidate = input.slice(start);
  return isDerivedDocumentId(candidate) ? candidate : undefined;
}

export function extractNodeIdFromSlug(nodeSlug: string | undefined) {
  return findUuid(nodeSlug) ?? findDerivedId(nodeSlug);
}

/** @deprecated Route loaders resolve the node; use `extractNodeIdFromSlug`. */
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
  const currentPath = getPathWithoutBase(path);
  const match = /^\/d\/([^/]+)/.exec(currentPath);
  return match?.[1] ?? "";
}

export function extractDriveIdFromSlug(driveSlug: string | undefined) {
  return findUuid(driveSlug) ?? findDerivedId(driveSlug);
}

/** @deprecated Route loaders resolve the drive; use `extractDriveIdFromSlug`. */
export function extractDriveIdFromPath(path: string) {
  const driveSlug = extractDriveSlugFromPath(path);
  const driveId = extractDriveIdFromSlug(driveSlug);
  return driveId;
}

/** Creates a URL string with the given pathname, keeping the query string.
 * @deprecated The store's `navigation` keeps global params across navigations. */
export function createUrlWithPreservedParams(pathname: string): string {
  const search = window.location.search;
  return search ? `${pathname}${search}` : pathname;
}
