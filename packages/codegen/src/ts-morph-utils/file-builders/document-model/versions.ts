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
};
export function createOrUpdateVersionConstantsFile({
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
    const currentLatestVersion = Math.max(...previousVersions);
    const nextVersion = currentLatestVersion + 1;
    const newVersions = Array.from(
      new Set([...previousVersions, nextVersion]),
    ).toSorted();
    versionsArray.replaceWithText(`[${newVersions.join(", ")}]`);

    const nextVersionIndex = newVersions.indexOf(nextVersion);

    const latestVariableIndex = sourceFile
      .getVariableDeclarationOrThrow(LATEST)
      .getInitializerIfKindOrThrow(SyntaxKind.ElementAccessExpression)
      .getArgumentExpressionOrThrow();

    latestVariableIndex.replaceWithText(nextVersionIndex.toString());

    return nextVersion;
  }

  /* Create the versions.ts file and initialize it with a single version of 1 
  and set the value of `latest` to be the first item in the array
  */
  const version = 1;
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
