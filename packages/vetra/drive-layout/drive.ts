import {
  PACKAGE_DOCUMENT_TYPE,
  PACKAGE_DRIVE_FOLDERS,
  folderForDocumentType,
  layoutFolderId,
  type PackageDriveFolder,
} from "./layout.js";

/** The part of a drive node the layout reads. */
export type LayoutNode = {
  id: string;
  name: string;
  kind: string;
  parentFolder?: string | null;
  documentType?: string;
};

/** A document that sits outside the folder of its type. */
export type MisplacedDocument = {
  id: string;
  name: string;
  documentType: string;
  /** Where the layout files the type; `null` is the drive root. */
  expected: PackageDriveFolder | null;
  /** Where it is, as a path of folder names; `null` is the drive root. */
  actual: string | null;
};

export type PackageDriveReport = {
  /** A drive is a package drive when it holds exactly one package document. */
  isPackageDrive: boolean;
  packageDocuments: { id: string; name: string }[];
  missingFolders: PackageDriveFolder[];
  misplaced: MisplacedDocument[];
  /** Nothing missing, nothing misplaced, one package document. */
  conforms: boolean;
};

function childFolder(
  nodes: readonly LayoutNode[],
  parent: string | null,
  name: string,
): LayoutNode | undefined {
  return nodes
    .filter(
      (node) =>
        node.kind === "folder" &&
        (node.parentFolder ?? null) === parent &&
        node.name === name,
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}

/** The node of a layout folder, found by its names from the root down. */
export function findLayoutFolder(
  nodes: readonly LayoutNode[],
  path: PackageDriveFolder,
): LayoutNode | undefined {
  let parent: string | null = null;
  let found: LayoutNode | undefined;
  for (const name of path.split("/")) {
    found = childFolder(nodes, parent, name);
    if (!found) return undefined;
    parent = found.id;
  }
  return found;
}

/** A node's folder as a path of names; `null` at the root or under a missing parent. */
function folderPathOf(
  nodes: readonly LayoutNode[],
  node: LayoutNode,
): string | null {
  const names: string[] = [];
  const seen = new Set<string>();
  let parentId = node.parentFolder ?? null;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = nodes.find((n) => n.id === parentId && n.kind === "folder");
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentFolder ?? null;
  }
  return names.length ? names.join("/") : null;
}

/** What a drive lacks to follow the package drive layout. Changes nothing. */
export function checkPackageDrive(
  nodes: readonly LayoutNode[],
): PackageDriveReport {
  const files = nodes.filter((node) => node.kind === "file");
  const packageDocuments = files
    .filter((node) => node.documentType === PACKAGE_DOCUMENT_TYPE)
    .map(({ id, name }) => ({ id, name }));
  const missingFolders = PACKAGE_DRIVE_FOLDERS.filter(
    (path) => !findLayoutFolder(nodes, path),
  );
  const misplaced: MisplacedDocument[] = [];
  for (const node of files) {
    if (!node.documentType) continue;
    const expected = folderForDocumentType(node.documentType);
    if (expected === undefined) continue;
    const expectedId = expected
      ? (findLayoutFolder(nodes, expected)?.id ?? undefined)
      : null;
    if ((node.parentFolder ?? null) === expectedId) continue;
    misplaced.push({
      id: node.id,
      name: node.name,
      documentType: node.documentType,
      expected,
      actual: folderPathOf(nodes, node),
    });
  }
  const isPackageDrive = packageDocuments.length === 1;
  return {
    isPackageDrive,
    packageDocuments,
    missingFolders,
    misplaced,
    conforms:
      isPackageDrive && missingFolders.length === 0 && misplaced.length === 0,
  };
}

/** An `ADD_FOLDER` input for the drive document. */
export type LayoutFolderInput = {
  id: string;
  name: string;
  parentFolder: string | null;
};

/**
 * The folders to add so the drive has `paths` (default: the whole layout),
 * parents first. Empty when they exist. An existing folder is kept whatever
 * its id.
 */
export function missingLayoutFolders(
  driveId: string,
  nodes: readonly LayoutNode[],
  paths: readonly PackageDriveFolder[] = PACKAGE_DRIVE_FOLDERS,
): LayoutFolderInput[] {
  const wanted = new Set<PackageDriveFolder>();
  for (const path of paths) {
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      wanted.add(parts.slice(0, i).join("/") as PackageDriveFolder);
    }
  }
  const ids = new Map<string, string>();
  const inputs: LayoutFolderInput[] = [];
  for (const path of PACKAGE_DRIVE_FOLDERS) {
    if (!wanted.has(path)) continue;
    const existing = findLayoutFolder(nodes, path);
    if (existing) {
      ids.set(path, existing.id);
      continue;
    }
    const cut = path.lastIndexOf("/");
    const id = layoutFolderId(driveId, path);
    ids.set(path, id);
    inputs.push({
      id,
      name: path.slice(cut + 1),
      parentFolder: cut < 0 ? null : (ids.get(path.slice(0, cut)) ?? null),
    });
  }
  return inputs;
}

/** What {@link ensurePackageDrive} needs from its host. */
export type PackageDriveHost = {
  /** The drive's nodes, read fresh. */
  nodes(): Promise<readonly LayoutNode[]>;
  /** Adds the folders to the drive, in order. */
  addFolders(folders: readonly LayoutFolderInput[]): Promise<void>;
  /** Creates the package document at the drive root. Left out: none is made. */
  createPackageDocument?(): Promise<void>;
};

/**
 * Makes a drive a package drive: adds the missing folders and, when the host
 * can, the package document. Moves nothing. Safe to run again.
 */
export async function ensurePackageDrive(
  driveId: string,
  host: PackageDriveHost,
): Promise<PackageDriveReport> {
  let nodes = await host.nodes();
  const folders = missingLayoutFolders(driveId, nodes);
  let changed = false;
  if (folders.length) {
    await host.addFolders(folders);
    changed = true;
  }
  const hasPackage = nodes.some(
    (node) =>
      node.kind === "file" && node.documentType === PACKAGE_DOCUMENT_TYPE,
  );
  if (!hasPackage && host.createPackageDocument) {
    await host.createPackageDocument();
    changed = true;
  }
  if (changed) nodes = await host.nodes();
  return checkPackageDrive(nodes);
}

/**
 * The folder node id a new document of this type goes in: `null` for the
 * drive root, also for a type the layout does not place or a folder the drive
 * lacks.
 */
export function folderIdForDocumentType(
  nodes: readonly LayoutNode[],
  documentType: string,
): string | null {
  const path = folderForDocumentType(documentType);
  if (!path) return null;
  return findLayoutFolder(nodes, path)?.id ?? null;
}
