import type {
  DocumentDriveDocument,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import {
  getDescendants,
  getNextCopyNumber,
  isFileNode,
  isFolderNode,
} from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { createZip, zipEntries } from "@powerhousedao/shared/document-model";
import {
  extractInitialState,
  fetchDocumentOperations,
  getDocumentExtension,
} from "./document.js";

export type FolderZipResult = {
  zip: Uint8Array;
  archiveName: string;
  entryCount: number;
  failed: string[];
};

const sanitize = (segment: string) => segment.replace(/\//g, "-");

/**
 * Name segments from the exported folder (exclusive) down to `node`
 * (inclusive), in top-down order. `root === undefined` means the drive root:
 * all ancestors. A node that IS the exported folder yields no segments.
 */
function segmentsBelow(
  root: Node | undefined,
  node: Node,
  allNodes: Node[],
): string[] {
  const segments: string[] = [];
  let current: Node | undefined = node;
  while (current && current.id !== root?.id) {
    segments.push(sanitize(current.name));
    const parentId: string | null | undefined = current.parentFolder;
    current = parentId ? allNodes.find((n) => n.id === parentId) : undefined;
  }
  return segments.reverse();
}

/**
 * Assemble the archive zip for a folder (or the whole drive when
 * `folderNode` is undefined). Every folder in the subtree becomes a
 * directory entry (empty folders survive); every file becomes a standard
 * single-document zip named after the node (drive naming convention:
 * `${name}.${extension}.phd`, ` (copy) N` on a same-folder collision).
 *
 * `fetchDocument` must return the document WITH its full operations and
 * initialState (see downloadFolderZip).
 */
export async function buildFolderZip(
  drive: DocumentDriveDocument,
  folderNode: FolderNode | undefined,
  fetchDocument: (id: string) => Promise<PHDocument>,
  onProgress?: (done: number, total: number) => void,
): Promise<FolderZipResult> {
  const allNodes = drive.state.global.nodes;
  const topName = sanitize(
    folderNode?.name ?? (drive.state.global.name || drive.header.name),
  );
  const subtree: Node[] = folderNode
    ? [folderNode, ...getDescendants(folderNode, allNodes)]
    : allNodes;

  // the top-level directory is explicit: in the folder case the folder node
  // creates the same entry, in the whole-drive case nothing else would
  const entries: Record<string, Uint8Array> = {
    [topName + "/"]: new Uint8Array(0),
  };
  for (const node of subtree) {
    if (!isFolderNode(node)) continue;
    const segments = segmentsBelow(folderNode, node, allNodes);
    const dir = [topName, ...segments].join("/");
    entries[dir + "/"] = new Uint8Array(0);
  }

  const files = subtree.filter(isFileNode);
  const failed: string[] = [];
  // keyed by directory path: a drive collision is same-parent-folder, so two
  // folders may each hold a `report` and neither leaf may be renamed
  const usedNamesByDir = new Map<string, Set<string>>();
  let done = 0;

  for (const node of files) {
    try {
      const doc = await fetchDocument(node.id);
      const extension = await getDocumentExtension(doc);

      // the file's own name goes into the leaf, so the path walk starts
      // at its parent folder
      const parent = node.parentFolder
        ? allNodes.find((n) => n.id === node.parentFolder)
        : undefined;
      const segments = parent
        ? segmentsBelow(folderNode, parent, allNodes)
        : [];
      const dir = [topName, ...segments].join("/");

      let usedNames = usedNamesByDir.get(dir);
      if (!usedNames) {
        usedNames = new Set<string>();
        usedNamesByDir.set(dir, usedNames);
      }

      const base = sanitize(node.name);
      let candidate = base;
      let count = getNextCopyNumber([...usedNames], base);
      while (usedNames.has(candidate)) {
        candidate = `${base} (copy) ${count}`;
        count += 1;
      }
      usedNames.add(candidate);

      const leaf = extension
        ? `${candidate}.${extension}.phd`
        : `${candidate}.phd`;
      entries[`${dir}/${leaf}`] = await createZip(doc);
    } catch {
      failed.push(node.name);
    } finally {
      done += 1;
      onProgress?.(done, files.length);
    }
  }

  const zip = await zipEntries(entries);
  return {
    zip,
    archiveName: `${topName}.zip`,
    entryCount: files.length - failed.length,
    failed,
  };
}

/**
 * Export a folder (or whole drive) to disk: fetches every document with its
 * full operation history, builds the archive, and saves it via
 * showSaveFilePicker (fallback: blob download), mirroring exportFile.
 */
export async function downloadFolderZip(
  drive: DocumentDriveDocument,
  folderNode?: FolderNode,
  onProgress?: (done: number, total: number) => void,
): Promise<FolderZipResult> {
  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const result = await buildFolderZip(
    drive,
    folderNode,
    async (id: string) => {
      const doc = await reactorClient.get<PHDocument>(id);
      // includes auth: an export must carry the policy history
      const operations = await fetchDocumentOperations(reactorClient, doc);
      const initialState = extractInitialState(operations["document"] ?? []);
      return { ...doc, operations, initialState };
    },
    onProgress,
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!window.showSaveFilePicker) {
    const blob = new Blob([new Uint8Array(result.zip)], {
      type: "application/zip",
    });
    const link = window.document.createElement("a");
    link.style.display = "none";
    link.href = URL.createObjectURL(blob);
    link.download = result.archiveName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    return result;
  }

  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: result.archiveName,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(result.zip));
    await writable.close();
  } catch (e) {
    // ignore the error if the user cancelled the file picker
    if (!(e instanceof DOMException && e.name === "AbortError")) {
      throw e;
    }
  }

  return result;
}
