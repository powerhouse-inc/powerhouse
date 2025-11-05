import type { PHDocument } from "document-model";
import { baseSaveToFile } from "document-model/node";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../../logger.js";

const BACKUP_FOLDER = "backup-documents";

/**
 * Exports a document to the backup directory.
 * Creates the backup directory if it doesn't exist.
 *
 * @param document - The document to backup
 * @param workingDir - Current working directory
 * @param extension - File extension for the document type (without dot)
 * @param name - Name of the document to use for the backup file (optional)
 * @returns Promise resolving to the backup file path, or undefined if backup failed
 */
export async function backupDocument(
  document: PHDocument,
  workingDir: string,
  extension: string = "",
  name?: string,
): Promise<string | undefined> {
  const docName = name ?? document.header.name;

  try {
    const backupPath = join(workingDir, BACKUP_FOLDER);
    await mkdir(backupPath, { recursive: true });

    const filePath = await baseSaveToFile(
      document,
      backupPath,
      extension,
      docName,
    );

    logger.debug(`📁 Document backed up to: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.warn(`⚠️ Failed to backup document "${docName}":`, error);
    return undefined;
  }
}
