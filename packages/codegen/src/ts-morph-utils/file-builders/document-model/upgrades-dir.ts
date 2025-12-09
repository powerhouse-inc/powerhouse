import { ts } from "@tmpl/core";
import path from "path";
import { VariableDeclarationKind, type Project } from "ts-morph";
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
  specVersions: number[];
  latestVersion: number;
  upgradesDirPath: string;
  documentTypeVariableName: string;
  packageImportPath: string;
}) {
  const {
    project,
    specVersions,
    upgradesDirPath,
    documentTypeVariableName,
    packageImportPath,
  } = args;
  const filePath = path.join(upgradesDirPath, "upgrade-manifest.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  const template = ts`
  import type { UpgradeManifest } from "document-model";
  import { latestVersion, supportedVersions } from "./versions.js";
  import { ${documentTypeVariableName} } from "${packageImportPath}";

  export const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
    documentType: ${documentTypeVariableName},
    latestVersion,
    supportedVersions,
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
    upgradeStrings.push(`v${version}`);
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
    const namedImports = [`v${version}`];
    const moduleSpecifier = `./v${version}.js`;
    imports.push({
      namedImports,
      moduleSpecifier,
    });
  }

  return imports;
}

type MakeVersionConstantsFileArgs = {
  project: Project;
  upgradesDirPath: string;
  specVersions: number[];
  latestVersion: number;
};
export function createOrUpdateVersionConstantsFile({
  specVersions,
  latestVersion,
  project,
  upgradesDirPath,
}: MakeVersionConstantsFileArgs) {
  const SUPPORTED_VERSIONS = "supportedVersions";
  const LATEST_VERSION = "latestVersion";
  const filePath = path.join(upgradesDirPath, "versions.ts");
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
