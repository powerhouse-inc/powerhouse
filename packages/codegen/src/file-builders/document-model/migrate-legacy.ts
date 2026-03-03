import { directoryExists, fileExists } from "@powerhousedao/common/clis";
import { copyFile, mkdir, readdir, rename } from "node:fs/promises";
import path from "path";

/**
 * Detects whether a document model directory has a legacy (non-versioned)
 * structure and migrates it to the versioned layout expected by `--use-versioning`.
 *
 * Detection: a directory is "legacy" when `src/reducers/` exists at root level
 * AND no `v1/` directory exists yet.
 *
 * Migration steps:
 * 1. Move legacy root-level items (`gen/`, `src/`, `tests/`, and known root files)
 *    into a `legacy/` subfolder for reference / backup.
 * 2. Copy custom source files (reducers, tests, utils) from `legacy/` into the
 *    soon-to-be-created `v1/` directory so that ts-morph picks them up during
 *    generation and preserves business logic.
 *
 * This function is idempotent — calling it on an already-migrated directory is a
 * no-op.
 */
export async function migrateLegacyToVersioned(
  documentModelDirPath: string,
): Promise<void> {
  const srcReducersPath = path.join(documentModelDirPath, "src", "reducers");
  const v1Path = path.join(documentModelDirPath, "v1");
  const legacyPath = path.join(documentModelDirPath, "legacy");

  // Detection: only migrate if legacy structure exists and v1 doesn't
  const hasSrcReducers = await directoryExists(srcReducersPath);
  const hasV1 = await directoryExists(v1Path);

  if (!hasSrcReducers || hasV1) {
    return;
  }

  console.log(
    `[migrate-legacy] Detected legacy structure in ${documentModelDirPath}`,
  );

  // Step 1: Create legacy directory
  await mkdir(legacyPath, { recursive: true });

  // Step 2: Move known root-level items into legacy/
  const dirsToMove = ["gen", "src", "tests"];
  const filesToMove = [
    "module.ts",
    "actions.ts",
    "hooks.ts",
    "utils.ts",
    "index.ts",
    "schema.graphql",
  ];

  for (const dirName of dirsToMove) {
    const srcPath = path.join(documentModelDirPath, dirName);
    if (await directoryExists(srcPath)) {
      const destPath = path.join(legacyPath, dirName);
      await rename(srcPath, destPath);
      console.log(`[migrate-legacy] Moved ${dirName}/ → legacy/${dirName}/`);
    }
  }

  for (const fileName of filesToMove) {
    const srcPath = path.join(documentModelDirPath, fileName);
    if (await fileExists(srcPath)) {
      const destPath = path.join(legacyPath, fileName);
      await rename(srcPath, destPath);
      console.log(`[migrate-legacy] Moved ${fileName} → legacy/${fileName}`);
    }
  }

  // Step 3: Copy custom source files into v1/ so ts-morph finds them
  const v1SrcReducersPath = path.join(v1Path, "src", "reducers");
  const v1SrcPath = path.join(v1Path, "src");
  const v1TestsPath = path.join(v1Path, "tests");

  // Copy legacy/src/reducers/*.ts → v1/src/reducers/
  const legacySrcReducersPath = path.join(legacyPath, "src", "reducers");
  if (await directoryExists(legacySrcReducersPath)) {
    await mkdir(v1SrcReducersPath, { recursive: true });
    await copyDirectoryFiles(legacySrcReducersPath, v1SrcReducersPath);
    console.log(`[migrate-legacy] Copied src/reducers/ → v1/src/reducers/`);
  }

  // Copy legacy/src/tests/*.ts → v1/src/tests/ (if exists)
  const legacySrcTestsPath = path.join(legacyPath, "src", "tests");
  if (await directoryExists(legacySrcTestsPath)) {
    const v1SrcTestsPath = path.join(v1SrcPath, "tests");
    await mkdir(v1SrcTestsPath, { recursive: true });
    await copyDirectoryFiles(legacySrcTestsPath, v1SrcTestsPath);
    console.log(`[migrate-legacy] Copied src/tests/ → v1/src/tests/`);
  }

  // Copy legacy/tests/*.ts → v1/tests/ (if exists)
  const legacyTestsPath = path.join(legacyPath, "tests");
  if (await directoryExists(legacyTestsPath)) {
    await mkdir(v1TestsPath, { recursive: true });
    await copyDirectoryFiles(legacyTestsPath, v1TestsPath);
    console.log(`[migrate-legacy] Copied tests/ → v1/tests/`);
  }

  // Copy legacy/src/utils.ts → v1/src/utils.ts (if exists)
  const legacyUtilsPath = path.join(legacyPath, "src", "utils.ts");
  if (await fileExists(legacyUtilsPath)) {
    await mkdir(v1SrcPath, { recursive: true });
    await copyFile(legacyUtilsPath, path.join(v1SrcPath, "utils.ts"));
    console.log(`[migrate-legacy] Copied src/utils.ts → v1/src/utils.ts`);
  }

  console.log(
    `[migrate-legacy] Migration complete for ${documentModelDirPath}`,
  );
}

/** Copy all files (non-recursive) from srcDir to destDir */
async function copyDirectoryFiles(
  srcDir: string,
  destDir: string,
): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      await copyFile(
        path.join(srcDir, entry.name),
        path.join(destDir, entry.name),
      );
    }
  }
}
