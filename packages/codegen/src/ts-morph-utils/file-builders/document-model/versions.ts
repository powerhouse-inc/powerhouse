import path from "path";
import type { Project } from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";
import { getArrayNumberElements } from "../../syntax-getters.js";

type MakeVersionConstantsFileArgs = {
  project: Project;
  documentModelDirPath: string;
  version: number;
};
export function createOrUpdateVersionConstantsFile({
  version,
  project,
  documentModelDirPath,
}: MakeVersionConstantsFileArgs) {
  const VERSIONS = "versions";
  const LATEST = "latest";
  const filePath = path.join(documentModelDirPath, "versions.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  /* Find the latest version in the `versions` array and add a new entry for the next version */
  if (alreadyExists) {
    const versionsArray = sourceFile
      .getVariableDeclarationOrThrow(VERSIONS)
      .getInitializerIfKindOrThrow(SyntaxKind.AsExpression)
      .getExpressionIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

    const previousVersions = getArrayNumberElements(versionsArray);

    if (previousVersions.includes(version)) return;

    const newVersions = Array.from(
      new Set([...previousVersions, version]),
    ).toSorted();
    versionsArray.replaceWithText(`[${newVersions.join(", ")}]`);

    const latestVersionIndex = newVersions[newVersions.length - 1].toString();

    const latestVariableIndex = sourceFile
      .getVariableDeclarationOrThrow(LATEST)
      .getInitializerIfKindOrThrow(SyntaxKind.ElementAccessExpression)
      .getArgumentExpressionOrThrow();

    if (latestVersionIndex === latestVariableIndex.getText()) return;

    latestVariableIndex.replaceWithText(latestVersionIndex);

    return;
  }

  /* Create the versions.ts file and initialize it with a single version of 1 
  and set the value of `latest` to be the first item in the array
  */
  const versionInitializer = `[${version}] as const;`;
  const latestInitializer = `versions[0];`;

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: VERSIONS,
        initializer: versionInitializer,
      },
    ],
  });

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: LATEST,
        initializer: latestInitializer,
      },
    ],
  });

  formatSourceFileWithPrettier(sourceFile);

  return version;
}
