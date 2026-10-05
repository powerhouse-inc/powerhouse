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
    window.location.origin + (window.ph?.basePath ?? "/"),
  ).pathname;
}

/** Returns the current path without the base path */
export function getPathWithoutBase(path: string) {
  const basePath = window.ph?.basePath ?? "/";
  return path.replace(basePath, basePath.endsWith("/") ? "/" : "");
}

/** Makes a URL component for a drive. */
export function makeDriveUrlComponent(
  drive: DocumentDriveDocument | undefined,
) {
  if (!drive) return "";
  return `/d/${slug(drive.header.slug)}`;
}

/**
 * Makes a URL component for a node: `<slugged name>-<id>`. The id is kept
 * verbatim, since a v2-required id is case-sensitive base64url.
 */
export function makeNodeSlug(node: Node | undefined) {
  if (!node) return "";
  const nameSlug = node.name ? slug(node.name) : "";
  return nameSlug ? `${nameSlug}-${node.id}` : node.id;
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

export function extractDriveIdFromPath(path: string) {
  const driveSlug = extractDriveSlugFromPath(path);
  const driveId = extractDriveIdFromSlug(driveSlug);
  return driveId;
}

/**
 * Creates a URL string with the given pathname while preserving existing query parameters.
 */
export function createUrlWithPreservedParams(pathname: string): string {
  const search = window.location.search;
  return search ? `${pathname}${search}` : pathname;
}
