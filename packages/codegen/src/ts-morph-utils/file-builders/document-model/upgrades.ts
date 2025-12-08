import { ts } from "@tmpl/core";
import path from "path";
import type { Project } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../../file-utils.js";
import { getObjectLiteral } from "../../syntax-getters.js";
import { upgradeTransitionTemplate } from "../../templates/document-model/upgrades/upgrade-transition.js";

type MakeUpgradeFileArgs = {
  project: Project;
  version: number;
  upgradesDirPath: string;
  documentModelPackageImportPath: string;
  phStateName: string;
};
export function makeUpgradeFile(args: MakeUpgradeFileArgs) {
  const {
    project,
    version,
    upgradesDirPath,
    documentModelPackageImportPath,
    phStateName,
  } = args;
  if (version < 2) return;

  const filePath = path.join(upgradesDirPath, `v${version}.ts`);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  const previousVersion = version - 1;
  const template = upgradeTransitionTemplate({
    version,
    previousVersion,
    documentModelPackageImportPath,
    phStateName,
  });

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function createOrUpdateUpgradeManifestFile(args: {
  project: Project;
  documentModelDirPath: string;
  specVersions: number[];
  latestVersion: number;
  upgradesDirPath: string;
  documentTypeVariableName: string;
  packageImportPath: string;
}) {
  const {
    project,
    documentModelDirPath,
    specVersions,
    upgradesDirPath,
    documentTypeVariableName,
    packageImportPath,
  } = args;
  const filePath = path.join(upgradesDirPath, "upgrade-manifest.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  const template = ts`
  import type { UpgradeManifest } from "document-model";
  import { latest, versions } from "../versions.js";
  import { ${documentTypeVariableName} } from "${packageImportPath}";

  export const upgradeManifest: UpgradeManifest<typeof versions> = {
    documentType: ${documentTypeVariableName},
    latestVersion: latest,
    supportedVersions: versions,
    upgrades: {},
  };
  `.raw;

  sourceFile.replaceWithText(template);

  const upgradeTransitionImports = buildUpgradeTransitionImports(specVersions);

  sourceFile.addImportDeclarations(upgradeTransitionImports);

  const upgradeManifestStatement =
    sourceFile.getVariableStatementOrThrow("upgradeManifest");
  const objectLiteral = getObjectLiteral(upgradeManifestStatement)!;
  const upgradesProperty = objectLiteral.getPropertyOrThrow("upgrades");
  const upgrades = buildUpgrades(specVersions);
  upgradesProperty.replaceWithText(upgrades);
  formatSourceFileWithPrettier(sourceFile);
}

function buildUpgrades(specVersions: number[]) {
  const upgradeStrings: string[] = [];

  for (const version of specVersions) {
    if (version < 2) continue;
    upgradeStrings.push(`${version}: upgradeToV${version}`);
  }

  return `upgrades: { ${upgradeStrings.join(",\n")} }`;
}

function buildUpgradeTransitionImports(specVersions: number[]) {
  const imports: {
    namedImports: string[];
    moduleSpecifier: string;
  }[] = [];

  for (const version of specVersions) {
    if (version < 2) continue;
    const namedImports = [`upgradeToV${version}`];
    const moduleSpecifier = `./v${version}.js`;
    imports.push({
      namedImports,
      moduleSpecifier,
    });
  }

  return imports;
}
