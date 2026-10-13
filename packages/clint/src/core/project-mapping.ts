import type { ProjectScanResult } from "./types.js";
import type {
  FolderOperations,
  FolderEntry,
} from "../integrations/powerhouse/types.js";

export interface ProjectMapping {
  /** Project name. */
  name: string;
  /** On-disk location (if found by scanner). */
  path: string | undefined;
  /** Document ID (if linked via spec JSON or found in personal drive). */
  documentId: string | undefined;
  /** Document type. */
  documentType: string | undefined;
  /** Path in the personal drive folder structure. */
  folderPath: string | undefined;
}

/**
 * Walk the drive folder tree recursively, collecting all document entries.
 * Uses a visited set to break cycles (e.g. self-referencing folder nodes).
 */
async function walkFolders(
  folders: FolderOperations,
  folderPath?: string,
  visited?: Set<string>,
): Promise<FolderEntry[]> {
  const seen = visited ?? new Set<string>();
  const key = folderPath ?? "";
  if (seen.has(key)) return [];
  seen.add(key);

  const entries = await folders.listFolder(folderPath || undefined);
  const results: FolderEntry[] = [];

  for (const entry of entries) {
    if (entry.type === "document") {
      results.push(entry);
    } else if (entry.type === "folder") {
      results.push(...(await walkFolders(folders, entry.path, seen)));
    }
  }

  return results;
}

/**
 * Merge on-disk scan results with personal drive folder entries
 * to produce a unified project mapping.
 *
 * Links are matched by documentId. Projects without a documentId
 * are still included (path-only). Drive documents without a matching
 * on-disk project are also included (document-only).
 */
export async function getProjectMapping(
  scanResults: ProjectScanResult[],
  folders?: FolderOperations,
): Promise<ProjectMapping[]> {
  const mappings: ProjectMapping[] = [];
  const seenDocIds = new Set<string>();

  // Start with on-disk scan results
  for (const scan of scanResults) {
    const mapping: ProjectMapping = {
      name: scan.name,
      path: scan.path,
      documentId: scan.documentId,
      documentType: scan.documentType,
      folderPath: undefined,
    };

    if (scan.documentId) seenDocIds.add(scan.documentId);
    mappings.push(mapping);
  }

  // Enrich with personal drive folder info
  if (folders) {
    const driveEntries = await walkFolders(folders);

    for (const entry of driveEntries) {
      const existing = mappings.find(
        (m) => m.documentId && m.documentId === entry.id,
      );

      if (existing) {
        // Enrich existing mapping with folder path
        existing.folderPath = entry.path;
      } else if (!seenDocIds.has(entry.id)) {
        // Document-only entry (not on disk)
        seenDocIds.add(entry.id);
        mappings.push({
          name: entry.name,
          path: undefined,
          documentId: entry.id,
          documentType: entry.documentType,
          folderPath: entry.path,
        });
      }
    }
  }

  return mappings;
}
