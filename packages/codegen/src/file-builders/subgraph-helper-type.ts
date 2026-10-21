import { pascalCase } from "change-case";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { discoverDocumentModelInDir } from "utils";
import { readManifest } from "./manifest.js";

export async function subgraphHelperTypeName(
  projectDir: string,
  pascalCaseName: string,
): Promise<string> {
  const hostReservedDocumentModelTypeNames = new Set(
    (await documentModelNames(projectDir)).map((name) =>
      pascalCase(name.replaceAll("/", " ")),
    ),
  );
  const preferredSubgraphItemTypeName = `${pascalCaseName}SubgraphItem`;
  for (let suffix = 1; ; suffix++) {
    const candidateItemTypeName =
      suffix === 1
        ? preferredSubgraphItemTypeName
        : `${preferredSubgraphItemTypeName}${suffix}`;
    if (!hostReservedDocumentModelTypeNames.has(candidateItemTypeName))
      return candidateItemTypeName;
  }
}

async function documentModelNames(projectDir: string): Promise<string[]> {
  const documentModelsDir = join(projectDir, "document-models");
  const specs = existsSync(documentModelsDir)
    ? readdirSync(documentModelsDir, { withFileTypes: true }).flatMap(
        (dirent) => {
          const discovery = discoverDocumentModelInDir(dirent);
          return discovery.kind === "model" ? [discovery.state.name] : [];
        },
      )
    : [];
  const listed =
    (await readManifest(projectDir))?.manifest.documentModels?.map(
      ({ name }) => name,
    ) ?? [];
  return [...specs, ...listed];
}
