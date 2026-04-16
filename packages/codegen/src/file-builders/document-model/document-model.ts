import type {
  DocumentModelFileMakerArgs,
  DocumentModelVariableNames,
} from "@powerhousedao/codegen";
import { directoryExists, fileExists } from "@powerhousedao/shared/clis";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { kebabCase } from "change-case";
import { createOrUpdateManifest } from "file-builders";
import {
  getDocumentModelDirName,
  getDocumentModelVariableNames,
} from "name-builders";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "path";
import {
  capitalize,
  filter,
  forEach,
  isTruthy,
  map,
  pipe,
  prop,
  uniqueBy,
} from "remeda";
import { documentModelsTemplate, upgradeManifestsTemplate } from "templates";
import { SyntaxKind, type Project } from "ts-morph";
import {
  buildTsMorphProject,
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getInitialStates,
  getOrCreateSourceFile,
  getVariableDeclarationByTypeName,
} from "utils";
import { generateDocumentModelZodSchemas } from "../../codegen/graphql.js";
import { makeGenDirFiles } from "./gen-dir.js";
import { makeRootDirFiles } from "./root-dir.js";
import { makeSrcDirFiles } from "./src-dir.js";
import { makeTestsDirFiles } from "./tests-dir.js";
import {
  createOrUpdateUpgradeManifestFile,
  createOrUpdateVersionConstantsFile,
  makeUpgradeFile,
  makeUpgradesIndexFile,
} from "./upgrades-dir.js";

/** Generates a document model from the given `documentModelState`
 *
 * If `useVersioning` is set to true, it will generate versioned document model code
 * for each `specification` in the `documentModelState`
 */
export async function tsMorphGenerateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  projectDir: string,
) {
  const project = buildTsMorphProject(projectDir);
  const documentModelsSourceFilesPath = path.join(
    projectDir,
    "document-models/**/*",
  );
  const documentModelsDirPath = path.join(projectDir, "document-models");
  const documentModelDirName = getDocumentModelDirName(documentModelState);
  const documentModelDirPath = path.join(
    documentModelsDirPath,
    documentModelDirName,
  );
  const upgradesDirPath = path.join(documentModelDirPath, "upgrades");
  const documentModelVariableNames = getDocumentModelVariableNames(
    documentModelState.name,
  );
  await ensureDirectoriesExist(
    project,
    documentModelsDirPath,
    documentModelDirPath,
  );
  await ensureDirectoriesExist(project, upgradesDirPath);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);

  const documentModelPackageImportPath = path.join(
    "document-models",
    documentModelDirName,
  );

  const specVersions = [
    ...new Set([
      ...documentModelState.specifications.map((spec) => spec.version),
    ]),
  ].toSorted();

  if (specVersions.length !== documentModelState.specifications.length) {
    throw new Error(
      "Document model specifications array is misconfigured. Length is not match with spec versions.",
    );
  }

  const latestVersion = specVersions[specVersions.length - 1];
  if (
    documentModelState.specifications[
      documentModelState.specifications.length - 1
    ].version !== latestVersion
  ) {
    throw new Error(
      "Document model has incorrect version at the latest version index",
    );
  }

  await writeDocumentModelStateJsonFile({
    documentModelState,
    documentModelDirName,
    documentModelDirPath,
  });

  await Promise.all(
    specVersions.map(
      async (version) =>
        await generateDocumentModelForSpec({
          project,
          version,
          useVersioning: true,
          documentModelState,
          projectDir,
          documentModelsDirPath,
          documentModelDirName,
          documentModelDirPath,
          documentModelPackageImportPath,
          ...documentModelVariableNames,
        }),
    ),
  );

  for (const version of specVersions) {
    await makeUpgradeFile({
      version,
      upgradesDirPath,
      project,
      documentModelPackageImportPath,
      ...documentModelVariableNames,
    });

    await makeDocumentModelIndexFile({
      project,
      documentModelDirPath,
      latestVersion,
    });

    await createOrUpdateVersionConstantsFile({
      project,
      specVersions,
      latestVersion,
      upgradesDirPath,
    });

    await createOrUpdateUpgradeManifestFile({
      project,
      specVersions,
      latestVersion,
      upgradesDirPath,
      documentModelId: documentModelState.id,
      ...documentModelVariableNames,
    });

    await makeUpgradesIndexFile({
      project,
      upgradesDirPath,
      specVersions,
      ...documentModelVariableNames,
    });
  }

  await makeDocumentModelsFile({ project, documentModelsDirPath });
  await makeUpgradeManifestsFile({ project, documentModelsDirPath });
  await project.save();
  await createOrUpdateManifest(
    {
      documentModels: [
        {
          name: documentModelState.name,
          id: documentModelState.id,
        },
      ],
    },
    projectDir,
  );
}

async function makeUpgradeManifestsFile(args: {
  project: Project;
  documentModelsDirPath: string;
}) {
  const { project, documentModelsDirPath } = args;
  const sourceFile = project.createSourceFile(
    path.join(documentModelsDirPath, "upgrade-manifests.ts"),
    upgradeManifestsTemplate,
    { overwrite: true },
  );

  const upgradeManifestsArray = sourceFile
    .getVariableDeclarationOrThrow("upgradeManifests")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  pipe(
    project.getSourceFiles(),
    // find the upgrade manifest files for each document model
    filter((sourceFile) => sourceFile.getBaseName() === "upgrade-manifest.ts"),
    // get the upgrade manifest objects
    map((sourceFile) =>
      getVariableDeclarationByTypeName(sourceFile, "UpgradeManifest"),
    ),
    filter(isTruthy),
    // get name and dir for adding to upgradeManifests array and making import specifier
    map((variableDeclaration) => ({
      name: variableDeclaration.getName(),
      // the upgrade-manifest.ts file lives in `document-models/{document-model-dir}/upgrades`
      documentModelDir: variableDeclaration
        .getSourceFile()
        .getDirectory()
        .getParentOrThrow()
        .getBaseName(),
    })),
    uniqueBy(prop("name")),
    // make named imports and module specifier to add for each upgrade manifest
    map(({ name, documentModelDir }) => ({
      name,
      namedImports: [name],
      moduleSpecifier: path.join(
        "document-models",
        documentModelDir,
        "upgrades",
      ),
    })),
    // add import of each upgrade manifest and add it to the upgradeManifests array
    forEach(({ name, namedImports, moduleSpecifier }) => {
      sourceFile.addImportDeclaration({ namedImports, moduleSpecifier });
      upgradeManifestsArray.addElement(name);
    }),
  );

  await formatSourceFileWithPrettier(sourceFile);
}

type GenerateDocumentModelFromSpecArgs = {
  project: Project;
  version: number;
  useVersioning: boolean;
  documentModelState: DocumentModelGlobalState;
  projectDir: string;
  documentModelPackageImportPath: string;
  documentModelsDirPath: string;
  documentModelDirName: string;
  documentModelDirPath: string;
} & DocumentModelVariableNames;
/** Generates document model code for a given `specification` from a `documentModelState` object */
async function generateDocumentModelForSpec({
  project,
  projectDir,
  documentModelState,
  documentModelPackageImportPath,
  documentModelsDirPath,
  documentModelDirName,
  documentModelDirPath,
  version,
  ...documentModelVariableNames
}: GenerateDocumentModelFromSpecArgs) {
  const specification = documentModelState.specifications.find(
    (spec) => spec.version === version,
  );

  if (!specification) {
    throw new Error(
      `Document model specifications array is misconfigured, no specification found for version: ${version}`,
    );
  }

  const versionDirName = `v${version}`;

  const documentModelVersionDirName = path.join(
    documentModelDirName,
    versionDirName,
  );

  const documentModelVersionDirPath = path.join(
    documentModelDirPath,
    versionDirName,
  );

  const versionedDocumentModelPackageImportPath = path.join(
    documentModelPackageImportPath,
    versionDirName,
  );

  const fileExtension = documentModelState.extension;
  const documentTypeId = documentModelState.id;
  const srcDirPath = path.join(documentModelVersionDirPath, "src");
  const reducersDirPath = path.join(srcDirPath, "reducers");
  const testsDirPath = path.join(documentModelVersionDirPath, "tests");
  const genDirPath = path.join(documentModelVersionDirPath, "gen");
  const schemaDirPath = path.join(genDirPath, "schema");
  const { initialGlobalState, initialLocalState } = getInitialStates(
    specification.state,
  );
  const hasLocalSchema = specification.state.local.schema !== "";
  const modules = specification.modules;
  const moduleDirPaths = modules.map((module) =>
    path.join(genDirPath, kebabCase(module.name)),
  );

  await ensureDirectoriesExist(
    project,
    documentModelVersionDirPath,
    reducersDirPath,
    testsDirPath,
    schemaDirPath,
    ...moduleDirPaths,
  );

  const fileMakerArgs: DocumentModelFileMakerArgs = {
    project,
    projectDir,
    version,
    documentTypeId,
    documentModelState,
    initialGlobalState,
    initialLocalState,
    modules,
    hasLocalSchema,
    documentModelsDirPath,
    documentModelDirPath,
    documentModelDirName,
    documentModelVersionDirName,
    documentModelVersionDirPath,
    documentModelPackageImportPath,
    versionedDocumentModelPackageImportPath,
    srcDirPath,
    genDirPath,
    testsDirPath,
    schemaDirPath,
    reducersDirPath,
    fileExtension,
    ...documentModelVariableNames,
  };

  await generateDocumentModelZodSchemas({
    documentModelDirPath: documentModelVersionDirPath,
    specification,
  });

  await makeRootDirFiles(fileMakerArgs);
  await makeGenDirFiles(fileMakerArgs);
  await makeSrcDirFiles(fileMakerArgs);
  await makeTestsDirFiles(fileMakerArgs);

  const previousVersionDirPath =
    getPreviousVersionDirPath(documentModelDirPath, version) ??
    path.join(documentModelDirPath, "v1");

  await persistCustomFilesFromPreviousVersion({
    currentVersionDirPath: documentModelVersionDirPath,
    previousVersionDirPath,
  });
}

async function makeDocumentModelsFile(args: {
  project: Project;
  documentModelsDirPath: string;
}) {
  const { project, documentModelsDirPath } = args;
  const sourceFile = project.createSourceFile(
    path.join(documentModelsDirPath, "document-models.ts"),
    documentModelsTemplate,
    { overwrite: true },
  );

  const documentModelsArray = sourceFile
    .getVariableDeclarationOrThrow("documentModels")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  pipe(
    project
      .getDirectoryOrThrow(documentModelsDirPath)
      .getDescendantSourceFiles(),
    filter((sourceFile) => sourceFile.getBaseName() === "module.ts"),
    uniqueBy((sourceFile) => sourceFile.getFilePath()),
    map((sourceFile) =>
      getVariableDeclarationByTypeName(sourceFile, "DocumentModel"),
    ),
    filter(isTruthy),
    map((variableDeclaration) => ({
      name: variableDeclaration.getName(),
      directory: variableDeclaration.getSourceFile().getDirectory(),
    })),
    map(({ name, directory }) => ({
      name,
      version: directory.getBaseName(),
      documentModelDir: directory.getParentOrThrow().getBaseName(),
    })),
    filter(({ version }) => /^v\d+$/.test(version)),
    map(({ name, version, documentModelDir }) => ({
      name: `${name}${capitalize(version)}`,
      namedImports: [`${name} as ${name}${capitalize(version)}`],
      moduleSpecifier: path.join("document-models", documentModelDir, version),
    })),
    forEach(({ name, namedImports, moduleSpecifier }) => {
      sourceFile.addImportDeclaration({
        namedImports,
        moduleSpecifier,
      });
      documentModelsArray.addElement(name);
    }),
  );
  await formatSourceFileWithPrettier(sourceFile);
}

/** Writes a json file derived from a `documentModelState` */
async function writeDocumentModelStateJsonFile({
  documentModelState,
  documentModelDirName,
  documentModelDirPath,
}: {
  documentModelState: DocumentModelGlobalState;
  documentModelDirPath: string;
  documentModelDirName: string;
}) {
  const filePath = path.join(
    documentModelDirPath,
    `${documentModelDirName}.json`,
  );
  const documentModelStateJson = JSON.stringify(documentModelState, null, 2);
  await writeFile(filePath, documentModelStateJson);
}

function getPreviousVersionDirPath(
  documentModelDirPath: string,
  version: number,
) {
  const previousVersion = version - 1;
  if (previousVersion < 1) return;

  const previousVersionDirName = `v${previousVersion}`;

  return path.join(documentModelDirPath, previousVersionDirName);
}

async function makeDocumentModelIndexFile(args: {
  project: Project;
  documentModelDirPath: string;
  latestVersion: number;
}) {
  const { project, documentModelDirPath, latestVersion } = args;

  const filePath = path.join(documentModelDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText("");
  sourceFile.addExportDeclarations([
    { moduleSpecifier: `./v${latestVersion}/index.js` },
    { moduleSpecifier: `./upgrades/index.js` },
  ]);

  await formatSourceFileWithPrettier(sourceFile);
}

type PersistCustomFilesFromPreviousVersionArgs = {
  currentVersionDirPath: string;
  previousVersionDirPath: string;
};
async function persistCustomFilesFromPreviousVersion(
  args: PersistCustomFilesFromPreviousVersionArgs,
) {
  const { currentVersionDirPath, previousVersionDirPath } = args;

  const previousVersionDirExists = await directoryExists(
    previousVersionDirPath,
  );

  if (!previousVersionDirExists) return;

  const previousVersionDirContents = await readdir(previousVersionDirPath, {
    withFileTypes: true,
    recursive: true,
  });

  const previousVersionFiles = previousVersionDirContents
    .filter((dirEnt) => dirEnt.isFile())
    .map(({ name, parentPath }) => ({
      name,
      parentPath,
      relativePath: path.relative(previousVersionDirPath, parentPath),
    }));

  for (const { name, relativePath } of previousVersionFiles) {
    const filePathInCurrentVersionDir = path.join(
      currentVersionDirPath,
      relativePath,
      name,
    );
    const filePathInPreviousVersionDir = path.join(
      previousVersionDirPath,
      relativePath,
      name,
    );
    const existsInPreviousVersionDir = await fileExists(
      filePathInPreviousVersionDir,
    );
    const existsInCurrentVersionDir = await fileExists(
      filePathInCurrentVersionDir,
    );
    if (existsInPreviousVersionDir && !existsInCurrentVersionDir) {
      console.log(
        `Persisting file "${path.join(relativePath, name)}" from previous version directory.`,
      );
      await mkdir(path.join(currentVersionDirPath, relativePath), {
        recursive: true,
      });
      await copyFile(filePathInPreviousVersionDir, filePathInCurrentVersionDir);
    }
  }
}
