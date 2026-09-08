import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import { isFolderNode } from "@powerhousedao/shared/document-drive";
import {
  isDocumentZip,
  parseBulkArchive,
} from "@powerhousedao/shared/document-model";
import { addFolder } from "./document.js";

export type BulkImportJob = { file: File; parent: Node | undefined };

/**
 * Expand a dropped file into import jobs. A single-document zip is passed
 * through unchanged. A bulk archive (a zip whose tree of files are
 * single-document zips) has its top-level folder — and subfolders —
 * recreated under `targetParent` (existing same-named folders are reused),
 * and each leaf becomes one job targeting its recreated folder. Throws
 * without touching the drive when no leaf is a document zip.
 */
export async function expandBulkArchive(
  file: File,
  driveId: string,
  targetParent: Node | undefined,
): Promise<BulkImportJob[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (await isDocumentZip(data)) {
    return [{ file, parent: targetParent }];
  }

  const entries = await parseBulkArchive(data);

  // Validate before any mutation: recreating the folder tree first would
  // leave the archive's folders orphaned in the drive when nothing in it
  // is importable. Throwing here keeps a junk zip a single failed upload.
  const isDocument = await Promise.all(
    entries.map((entry) => isDocumentZip(entry.data)),
  );
  if (!isDocument.some(Boolean)) {
    throw new Error("Archive contains no Powerhouse documents");
  }

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  const drive = (await reactorClient.get(driveId)) as DocumentDriveDocument;
  const knownNodes = [...drive.state.global.nodes];

  // A recreated folder is looked up once per archive path and shared by
  // every leaf under it; the drive's existing folders are the seed.
  const dirToNode = new Map<string, Node>();
  const ensureDir = async (
    dirPath: string,
    parent: Node | undefined,
  ): Promise<Node> => {
    const cached = dirToNode.get(dirPath);
    if (cached) return cached;
    const name = dirPath.split("/").pop() ?? dirPath;
    const existing = knownNodes.find(
      (n) =>
        isFolderNode(n) &&
        n.name === name &&
        (n.parentFolder ?? null) === (parent?.id ?? null),
    );
    const node = existing ?? (await addFolder(driveId, name, parent?.id));
    dirToNode.set(dirPath, node);
    knownNodes.push(node);
    return node;
  };

  const jobs: BulkImportJob[] = [];
  for (const entry of entries) {
    const segments = entry.path.split("/");
    const leaf = segments.pop()!;
    let parent = targetParent;
    let prefix = "";
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      parent = await ensureDir(prefix, parent);
    }
    // Copy: the zip entry's buffer is ArrayBufferLike, but File parts
    // require a dedicated ArrayBuffer view.
    jobs.push({ file: new File([new Uint8Array(entry.data)], leaf), parent });
  }
  return jobs;
}
