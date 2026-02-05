import {
  upgradeManifestTemplate,
  upgradeTransitionTemplate,
} from "@powerhousedao/codegen/templates";
import {
  formatSourceFileWithPrettier,
  getObjectLiteral,
  getOrCreateSourceFile,
  getVariableDeclarationByTypeName,
} from "@powerhousedao/codegen/utils";
import path from "path";
import { VariableDeclarationKind, type Project } from "ts-morph";

type MakeUpgradeFileArgs = {
  project: Project;
  version: number;
  upgradesDirPath: string;
  documentModelPackageImportPath: string;
  phStateName: string;
};
export async function makeUpgradeFile(args: MakeUpgradeFileArgs) {
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
  await formatSourceFileWithPrettier(sourceFile);
}

export async function createOrUpdateUpgradeManifestFile(args: {
  project: Project;
  specVersions: number[];
  latestVersion: number;
  upgradesDirPath: string;
  documentModelId: string;
  upgradeManifestName: string;
}) {
  const {
    project,
    specVersions,
    upgradesDirPath,
    documentModelId,
    upgradeManifestName,
  } = args;
  const filePath = path.join(upgradesDirPath, "upgrade-manifest.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  const template = upgradeManifestTemplate({
    documentModelId,
    upgradeManifestName,
  });

  sourceFile.replaceWithText(template);

  const upgradeTransitionImports = buildUpgradeTransitionImports(specVersions);

  sourceFile.addImportDeclarations(upgradeTransitionImports);

  const upgradeManifestStatement = getVariableDeclarationByTypeName(
    sourceFile,
    "UpgradeManifest",
  )?.getVariableStatementOrThrow();
  const objectLiteral = getObjectLiteral(upgradeManifestStatement)!;
  const upgradesProperty = objectLiteral.getPropertyOrThrow("upgrades");
  const upgrades = buildUpgrades(specVersions);
  upgradesProperty.replaceWithText(upgrades);
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
  specVersions: number[];
  latestVersion: number;
};
export async function createOrUpdateVersionConstantsFile({
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

  await formatSourceFileWithPrettier(sourceFile);
}

type MakeUpgradesIndexFileArgs = {
  project: Project;
  upgradesDirPath: string;
  upgradeManifestName: string;
  specVersions: number[];
};
export async function makeUpgradesIndexFile({
  project,
  upgradesDirPath,
  specVersions,
  upgradeManifestName,
}: MakeUpgradesIndexFileArgs) {
  const filePath = path.join(upgradesDirPath, "index.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  sourceFile.replaceWithText("");

  const upgradeReducerExports = makeUpgradeReducerExports(specVersions);

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
