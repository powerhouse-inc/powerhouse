import type { DocumentModelFileMakerArgs } from "../types.js";

/**
 * `args` with `versionImportPath` spelled for a file in `fromDir`. In
 * ./document-models it stays the `document-models/*` alias; elsewhere a
 * relative path, so each file needs its own.
 */
export function importingFrom<T extends DocumentModelFileMakerArgs>(
  args: T,
  fromDir: string,
): T {
  return {
    ...args,
    versionImportPath: args.importDocumentModel(
      fromDir,
      args.documentModelDirName,
      args.versionDirName,
    ),
  };
}
