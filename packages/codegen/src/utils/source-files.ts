import path from "path";
import type { Project, SourceFile } from "ts-morph";
import { FileSystemRefreshResult } from "ts-morph";

/** Gets a SourceFile by name in a ts-morph Project, or creates a new one
 * if none with that path exists.
 *
 * "Exists" has to mean *on disk*, not merely "already loaded in this Project".
 * Projects here are built with `skipAddingFilesFromTsConfig` (see
 * `buildTsMorphProject`), so they start empty and `getSourceFile` alone reports
 * every existing file as missing. Combined with `overwrite: true` that silently
 * discarded whatever the user had written — `alreadyExists` was always `false`,
 * so builders that scaffold-once-then-amend (tests, reducers, subgraphs,
 * editors, processors) re-scaffolded from scratch on every run and hand-written
 * code was lost on `project.save()`.
 *
 * Reading the file in when it is on disk but not yet loaded mirrors what
 * `DirectoryManager.createSourceFile` already does. Files that codegen fully
 * owns are unaffected: they call `replaceWithText` immediately afterwards.
 *
 * The rule has to hold on the cache-hit path too, which is the other half of
 * the same data loss. `ph vetra` builds one Project per process and reuses it
 * for every codegen run, and nothing ever refreshes it, so a SourceFile loaded
 * by an earlier run keeps the text it had then: codegen scaffolds a reducer
 * with TODO stubs, the user writes the real body on disk, and the next run in
 * that session still sees the stubs and writes them back on `project.save()`.
 * A fresh process (`ph generate`) never hit this — the cache miss forced a read
 * from disk. Refreshing a cached SourceFile before handing it out makes the
 * long-lived Project behave like a fresh one. Only cached files are refreshed;
 * `addSourceFileAtPathIfExists` has just read disk, so refreshing that again
 * would be I/O for a guaranteed `NoChange`.
 */
export function getOrCreateSourceFile(project: Project, filePath: string) {
  const dirName = path.dirname(filePath);
  if (!project.getDirectory(dirName)) {
    project.createDirectory(dirName);
  }
  const cachedSourceFile = project.getSourceFile(filePath);
  const sourceFile = cachedSourceFile
    ? refreshCachedSourceFile(cachedSourceFile)
    : project.addSourceFileAtPathIfExists(filePath);
  if (!sourceFile) {
    // `overwrite: false` so that a future regression here fails loudly instead
    // of quietly truncating a file: reaching this line now means the path is
    // genuinely absent from both the project and the disk.
    const newSourceFile = project.createSourceFile(filePath, "", {
      overwrite: false,
    });
    return {
      alreadyExists: false,
      sourceFile: newSourceFile,
    };
  }
  return {
    alreadyExists: true,
    sourceFile,
  };
}

/** Re-reads a cached SourceFile from disk, `undefined` once it is gone from
 * disk (ts-morph forgets it then, so the caller re-creates it). */
function refreshCachedSourceFile(sourceFile: SourceFile) {
  // Pending in-memory edits belong to the run in progress; disk is only the
  // authority while the loaded copy matches what codegen last wrote out.
  if (!sourceFile.isSaved()) return sourceFile;
  const result = sourceFile.refreshFromFileSystemSync();
  return result === FileSystemRefreshResult.Deleted ? undefined : sourceFile;
}

/** Gets a Directory by name in a ts-morph Project, or creates a new one
 * if none with that path exists.
 */
export function getOrCreateDirectory(project: Project, dirPath: string) {
  const directory = project.getDirectory(dirPath);
  if (!directory) {
    const newDirectory = project.createDirectory(dirPath);
    return {
      alreadyExists: false,
      directory: newDirectory,
    };
  }
  return {
    alreadyExists: true,
    directory,
  };
}

/** Ensures that the directories at the given paths exist within the
 * ts-morph Project
 */
export async function ensureDirectoriesExist(
  project: Project,
  ...pathsToEnsure: string[]
) {
  for (const dirPath of pathsToEnsure) {
    const dir = project.getDirectory(dirPath);
    if (!dir) {
      const newDir = project.createDirectory(dirPath);
      await newDir.save();
    }
  }
}

export function getPreviousVersionSourceFile(args: {
  project: Project;
  version: number;
  filePath: string;
}) {
  const { project, version, filePath } = args;
  const previousVersion = version - 1;
  if (previousVersion < 1) return;
  const previousVersionFilePath = filePath.replace(
    `/v${version}/`,
    `/v${previousVersion}/`,
  );

  // With skipAddingFilesFromTsConfig, the file isn't in the project yet;
  // add it from disk so getSourceFile can find it instead of returning undefined.
  try {
    project.addSourceFileAtPath(previousVersionFilePath);
  } catch {
    // previous version file doesn't exist on disk — fall through to getSourceFile
  }

  const previousVersionFile = project.getSourceFile(previousVersionFilePath);

  return previousVersionFile;
}
