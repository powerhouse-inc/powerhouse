import { DOCUMENT_TYPES } from "../editors/vetra-drive-app/document-types.js";

/** The package document: the drive's anchor, filed at the drive root. */
export const PACKAGE_DOCUMENT_TYPE = DOCUMENT_TYPES.documentPackage;

/** The folders of a package drive, parents before children, `/`-separated. */
export const PACKAGE_DRIVE_FOLDERS = [
  "ideate",
  "ideate/features",
  "specify",
  "specify/document-models",
  "specify/editors",
  "specify/apps",
  "specify/processors",
  "specify/subgraphs",
  "build",
  "build/work",
  "deploy",
  "deploy/environments",
  "deploy/licences",
] as const;

export type PackageDriveFolder = (typeof PACKAGE_DRIVE_FOLDERS)[number];

/** Where a document type is filed; `null` is the drive root. */
export const DOCUMENT_TYPE_FOLDERS: Readonly<
  Record<string, PackageDriveFolder | null>
> = {
  [PACKAGE_DOCUMENT_TYPE]: null,
  "powerhouse/problem-sheet": "ideate",
  "powerhouse/audience-sheet": "ideate",
  "powerhouse/brand-sheet": "ideate",
  "powerhouse/feature": "ideate/features",
  "powerhouse/work-breakdown-structure": "build/work",
  [DOCUMENT_TYPES.documentModel]: "specify/document-models",
  [DOCUMENT_TYPES.documentEditor]: "specify/editors",
  [DOCUMENT_TYPES.documentApp]: "specify/apps",
  [DOCUMENT_TYPES.documentProcessor]: "specify/processors",
  [DOCUMENT_TYPES.documentSubgraph]: "specify/subgraphs",
};

/**
 * The folder a document type belongs in: a path, `null` for the drive root,
 * `undefined` for a type the layout does not place.
 */
export function folderForDocumentType(
  documentType: string,
): PackageDriveFolder | null | undefined {
  return Object.hasOwn(DOCUMENT_TYPE_FOLDERS, documentType)
    ? DOCUMENT_TYPE_FOLDERS[documentType]
    : undefined;
}

function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The id of a layout folder in a drive. Derived from the drive and the path,
 * so two writers that create the same folder apart create one node.
 */
export function layoutFolderId(
  driveId: string,
  path: PackageDriveFolder,
): string {
  const key = `${driveId}/${path}`;
  const hex = [0x811c9dc5, 0x01234567, 0x89abcdef, 0xdeadbeef]
    .map((seed) => fnv1a(key, seed).toString(16).padStart(8, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
