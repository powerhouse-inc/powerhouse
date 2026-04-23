import type { DocumentModelFileMakerArgs } from "file-builders";
import path from "path";
import { upgradeManifestTemplate, upgradeTransitionTemplate } from "templates";
import { VariableDeclarationKind, type Project } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getObjectLiteral,
  getOrCreateSourceFile,
  getVariableDeclarationByTypeName,
} from "utils";

export async function makeUpgradeFile(args: DocumentModelFileMakerArgs) {
  const { project, version, upgradesDirPath } = args;
  if (version < 2) return;

  const filePath = path.join(upgradesDirPath, `v${version}.ts`);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) return;

  const template = upgradeTransitionTemplate(args);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function createOrUpdateUpgradeManifestFile(
  args: DocumentModelFileMakerArgs,
) {
  const { project, versions, upgradesDirPath } = args;
  const filePath = path.join(upgradesDirPath, "upgrade-manifest.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  const template = upgradeManifestTemplate(args);

  sourceFile.replaceWithText(template);

  const upgradeTransitionImports = buildUpgradeTransitionImports(versions);

  sourceFile.addImportDeclarations(upgradeTransitionImports);

  const upgradeManifestStatement = getVariableDeclarationByTypeName(
    sourceFile,
    "UpgradeManifest",
  )?.getVariableStatementOrThrow();
  const objectLiteral = getObjectLiteral(upgradeManifestStatement);
  const upgradesProperty = objectLiteral?.getProperty("upgrades");
  const upgrades = buildUpgrades(versions);
  upgradesProperty?.replaceWithText(upgrades);
  await formatSourceFileWithPrettier(sourceFile);
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
  versions: number[];
  latestVersion: number;
};
export async function createOrUpdateVersionConstantsFile({
  versions,
  latestVersion,
  project,
  upgradesDirPath,
}: MakeVersionConstantsFileArgs) {
  const SUPPORTED_VERSIONS = "supportedVersions";
  const LATEST_VERSION = "latestVersion";
  const filePath = path.join(upgradesDirPath, "versions.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  sourceFile.replaceWithText("");

  const latestVersionIndex = versions.indexOf(latestVersion);
  const versionInitializer = `[${versions.join(", ")}] as const;`;
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

  await formatSourceFileWithPrettier(sourceFile);
}

type MakeUpgradesIndexFileArgs = {
  project: Project;
  upgradesDirPath: string;
  upgradeManifestName: string;
  versions: number[];
};
export async function makeUpgradesIndexFile({
  project,
  upgradesDirPath,
  versions,
  upgradeManifestName,
}: MakeUpgradesIndexFileArgs) {
  const filePath = path.join(upgradesDirPath, "index.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  sourceFile.replaceWithText("");

  const upgradeReducerExports = makeUpgradeReducerExports(versions);

  sourceFile.addExportDeclarations([
    {
      namedExports: [upgradeManifestName],
      moduleSpecifier: "./upgrade-manifest.js",
    },
    {
      namedExports: ["supportedVersions", "latestVersion"],
      moduleSpecifier: "./versions.js",
    },
    ...upgradeReducerExports,
  ]);
  await formatSourceFileWithPrettier(sourceFile);
}

function makeUpgradeReducerExports(specVersions: number[]) {
  const exports: {
    namedExports: string[];
    moduleSpecifier: string;
  }[] = [];

  for (const version of specVersions) {
    if (version < 2) continue;
    const namedExports = [`v${version}`];
    const moduleSpecifier = `./v${version}.js`;
    exports.push({
      namedExports,
      moduleSpecifier,
    });
  }

  return exports;
}
