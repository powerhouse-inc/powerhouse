import path from "path";
import type { Project } from "ts-morph";
import { VariableDeclarationKind } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";

type MakeVersionConstantsFileArgs = {
  project: Project;
  documentModelDirPath: string;
  specVersions: number[];
  latestVersion: number;
};
export function createOrUpdateVersionConstantsFile({
  specVersions,
  latestVersion,
  project,
  documentModelDirPath,
}: MakeVersionConstantsFileArgs) {
  const SUPPORTED_VERSIONS = "supportedVersions";
  const LATEST_VERSION = "latestVersion";
  const filePath = path.join(documentModelDirPath, "versions.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  sourceFile.replaceWithText("");

  const latestVersionIndex = specVersions.indexOf(latestVersion);
  const versionInitializer = `[${specVersions.join(", ")}] as const;`;
  const latestInitializer = `${SUPPORTED_VERSIONS}[${latestVersionIndex}];`;

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: SUPPORTED_VERSIONS,
        initializer: versionInitializer,
      },
    ],
  });

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: LATEST_VERSION,
        initializer: latestInitializer,
      },
    ],
  });

  formatSourceFileWithPrettier(sourceFile);
}
