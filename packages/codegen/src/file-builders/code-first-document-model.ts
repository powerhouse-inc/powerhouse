import { camelCase, kebabCase, pascalCase } from "change-case";
import { constants } from "node:fs";
import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  codeFirstModelTemplate,
  codeFirstModelTestTemplate,
  codeFirstReducersTemplate,
  codeFirstRootIndexTemplate,
  codeFirstUpgradeTestTemplate,
  codeFirstUpgradeTransitionTemplate,
  codeFirstUpgradesIndexTemplate,
  type CodeFirstDocumentModelTemplateVariables,
} from "templates";
import {
  Project,
  SyntaxKind,
  VariableDeclarationKind,
  type SourceFile,
} from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
  writeScaffoldFile,
} from "utils";
import { registerCodeFirstDefinitionSource } from "./definition-sources.js";
import { refreshDocumentModelAggregateFiles } from "./document-model/document-model.js";
import { createOrUpdateManifest } from "./manifest.js";

export type GenerateCodeFirstDocumentModelArgs = {
  id: string;
  name: string;
  extension?: string;
  version?: number;
};

function validateArgs(args: GenerateCodeFirstDocumentModelArgs): void {
  if (!/^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$/.test(args.name)) {
    throw new Error(
      "Code-first document model names must start with a letter and use single spaces between alphanumeric words.",
    );
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(args.id)) {
    throw new Error(
      "Code-first document model IDs must use the organization/document-type format.",
    );
  }
  const version = args.version ?? 1;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(
      "Code-first document model versions must be positive safe integers.",
    );
  }
  if (
    args.extension !== undefined &&
    !/^\.?[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(args.extension)
  ) {
    throw new Error(
      "Code-first document model extensions must be a non-empty file extension without path separators or whitespace.",
    );
  }
}

function templateVariables(
  args: GenerateCodeFirstDocumentModelArgs,
): CodeFirstDocumentModelTemplateVariables {
  const version = args.version ?? 1;
  const organization = args.id.slice(0, args.id.indexOf("/"));
  return {
    camelCaseName: camelCase(args.name),
    descriptionLiteral: JSON.stringify(
      `A code-first ${args.name} document model.`,
    ),
    extensionLiteral: JSON.stringify(args.extension ?? kebabCase(args.name)),
    idLiteral: JSON.stringify(args.id),
    name: args.name,
    nameLiteral: JSON.stringify(args.name),
    organizationLiteral: JSON.stringify(organization),
    pascalCaseName: pascalCase(args.name),
    version,
  };
}

function replaceVersionNames(
  source: string,
  sourcePath: string,
  v: CodeFirstDocumentModelTemplateVariables,
): string {
  const previousVersion = v.version - 1;
  const transformProject = new Project({ useInMemoryFileSystem: true });
  const sourceFile = transformProject.createSourceFile(sourcePath, source);
  const identifierRenames = new Map([
    [
      `${v.camelCaseName}V${previousVersion}`,
      `${v.camelCaseName}V${v.version}`,
    ],
    [
      `${v.pascalCaseName}V${previousVersion}`,
      `${v.pascalCaseName}V${v.version}`,
    ],
  ]);

  for (const identifier of sourceFile.getDescendantsOfKind(
    SyntaxKind.Identifier,
  )) {
    const identifierText = identifier.getText();
    const replacement =
      identifierRenames.get(identifierText) ??
      [...identifierRenames].reduce<string | undefined>(
        (match, [previousName, nextName]) => {
          if (match !== undefined || !identifierText.startsWith(previousName)) {
            return match;
          }
          const suffix = identifierText.slice(previousName.length);
          return suffix === "" || /^[A-Z_$]/.test(suffix)
            ? `${nextName}${suffix}`
            : undefined;
        },
        undefined,
      );
    if (replacement) identifier.replaceWithText(replacement);
  }

  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.getExpression().getText() === "defineDocumentModel") {
      const declaration = call.getParentIfKind(SyntaxKind.VariableDeclaration);
      if (declaration?.getName() !== `${v.camelCaseName}V${v.version}`) {
        continue;
      }
      const config = call
        .getArguments()[0]
        ?.asKind(SyntaxKind.ObjectLiteralExpression);
      const version = config
        ?.getProperty("version")
        ?.asKind(SyntaxKind.PropertyAssignment);
      version?.setInitializer(String(v.version));
    }

    if (call.getExpression().getText() === "describe") {
      const description = call
        .getArguments()[0]
        ?.asKind(SyntaxKind.StringLiteral);
      if (
        description?.getLiteralValue() ===
        `${v.pascalCaseName} v${previousVersion}`
      ) {
        description.setLiteralValue(`${v.pascalCaseName} v${v.version}`);
      }
    }

    const property = call
      .getExpression()
      .asKind(SyntaxKind.PropertyAccessExpression);
    const expectedVersion = call
      .getArguments()[0]
      ?.asKind(SyntaxKind.NumericLiteral);
    const subject = property
      ?.getExpression()
      .asKind(SyntaxKind.CallExpression)
      ?.getArguments()[0];
    if (
      property?.getName() === "toBe" &&
      expectedVersion?.getLiteralValue() === previousVersion &&
      subject?.getText() === "document.state.document.version"
    ) {
      expectedVersion.replaceWithText(String(v.version));
    }
  }

  return sourceFile.getFullText();
}

async function copyAuthoredTree(args: {
  project: Project;
  sourcePath: string;
  targetPath: string;
  variables: CodeFirstDocumentModelTemplateVariables;
}): Promise<void> {
  const { project, sourcePath, targetPath, variables } = args;
  const entries = await readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntry = join(sourcePath, entry.name);
    const targetEntry = join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await ensureDirectoriesExist(project, targetEntry);
      await copyAuthoredTree({
        project,
        sourcePath: sourceEntry,
        targetPath: targetEntry,
        variables,
      });
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `Cannot copy a symbolic link or special entry into a new code-first version: ${sourceEntry}`,
      );
    }
    if (![".ts", ".tsx", ".mts", ".cts"].includes(extname(entry.name))) {
      await mkdir(dirname(targetEntry), { recursive: true });
      try {
        await copyFile(sourceEntry, targetEntry, constants.COPYFILE_EXCL);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      continue;
    }
    const source = replaceVersionNames(
      await readFile(sourceEntry, "utf8"),
      sourceEntry,
      variables,
    );
    await writeScaffoldFile(project, targetEntry, source);
  }
}

async function assertCopyableAuthoredTree(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await assertCopyableAuthoredTree(path);
    } else if (!entry.isFile()) {
      throw new Error(
        `Cannot copy a symbolic link or special entry into a new code-first version: ${path}`,
      );
    }
  }
}

async function assertPreviousVersionExists(
  modelDirPath: string,
  version: number,
): Promise<void> {
  if (version === 1) return;
  try {
    await readdir(join(modelDirPath, `v${version - 1}`));
  } catch {
    throw new Error(
      `Cannot scaffold v${version} before v${version - 1} exists.`,
    );
  }
}

async function copyPreviousVersion(
  project: Project,
  modelDirPath: string,
  v: CodeFirstDocumentModelTemplateVariables,
): Promise<void> {
  if (v.version === 1) return;
  const previousDir = join(modelDirPath, `v${v.version - 1}`);
  let previousEntries;
  try {
    previousEntries = await readdir(previousDir, { withFileTypes: true });
  } catch {
    throw new Error(
      `Cannot scaffold v${v.version} before v${v.version - 1} exists.`,
    );
  }
  await assertCopyableAuthoredTree(previousDir);
  if (previousEntries.length === 0) return;
  await copyAuthoredTree({
    project,
    sourcePath: previousDir,
    targetPath: join(modelDirPath, `v${v.version}`),
    variables: v,
  });
}

function ensureNamedImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  name: string,
): void {
  const declaration = sourceFile.getImportDeclaration(
    (candidate) => candidate.getModuleSpecifierValue() === moduleSpecifier,
  );
  if (!declaration) {
    sourceFile.addImportDeclaration({
      namedImports: [name],
      moduleSpecifier,
    });
    return;
  }
  if (!declaration.getNamedImports().some((item) => item.getName() === name)) {
    declaration.addNamedImport(name);
  }
}

function arrayForVariable(sourceFile: SourceFile, name: string) {
  return sourceFile
    .getVariableDeclarationOrThrow(name)
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);
}

async function includeVersionInRootIndex(
  project: Project,
  modelDirPath: string,
  v: CodeFirstDocumentModelTemplateVariables,
): Promise<void> {
  if (v.version === 1) return;
  const indexFile = getOrCreateSourceFile(
    project,
    join(modelDirPath, "index.ts"),
  ).sourceFile;
  const definitionName = `${v.camelCaseName}V${v.version}Definition`;
  ensureNamedImport(indexFile, `./v${v.version}/model.js`, definitionName);
  const versions = arrayForVariable(indexFile, "versions");
  if (
    !versions
      .getElements()
      .some((element) => element.getText() === definitionName)
  ) {
    versions.addElement(definitionName);
  }

  const exportName = `${v.pascalCaseName}V${v.version}`;
  if (!indexFile.getVariableDeclaration(exportName)) {
    const manifestStatement = indexFile
      .getVariableDeclarationOrThrow(`${v.camelCaseName}UpgradeManifest`)
      .getVariableStatementOrThrow();
    const manifestIndex = indexFile.getStatements().indexOf(manifestStatement);
    indexFile.insertVariableStatement(manifestIndex, {
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: exportName,
          initializer: `${v.pascalCaseName}Family.at(${v.version})`,
        },
      ],
      isExported: true,
    });
  }
  await formatSourceFileWithPrettier(indexFile);
}

async function includeUpgradeTransition(
  project: Project,
  upgradesDirPath: string,
  v: CodeFirstDocumentModelTemplateVariables,
): Promise<void> {
  if (v.version === 1) return;
  const upgradesFile = getOrCreateSourceFile(
    project,
    join(upgradesDirPath, "index.ts"),
  ).sourceFile;
  const transitionName = `upgradeToV${v.version}`;
  ensureNamedImport(upgradesFile, `./v${v.version}.js`, transitionName);
  const upgrades = arrayForVariable(upgradesFile, "upgrades");
  if (
    !upgrades
      .getElements()
      .some((element) => element.getText() === transitionName)
  ) {
    upgrades.addElement(transitionName);
  }
  await formatSourceFileWithPrettier(upgradesFile);
}

export async function tsMorphGenerateCodeFirstDocumentModel(
  args: GenerateCodeFirstDocumentModelArgs & { project: Project },
): Promise<void> {
  validateArgs(args);
  const { project } = args;
  const v = templateVariables(args);
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  const projectDir = documentModelsDir.getParentOrThrow().getPath();
  const modelDirPath = join(documentModelsDirPath, kebabCase(args.name));
  const versionDirPath = join(modelDirPath, `v${v.version}`);
  const upgradesDirPath = join(modelDirPath, "upgrades");
  const testsDirPath = join(versionDirPath, "tests");
  await assertPreviousVersionExists(modelDirPath, v.version);
  await ensureDirectoriesExist(
    project,
    modelDirPath,
    versionDirPath,
    upgradesDirPath,
    testsDirPath,
  );

  await writeScaffoldFile(
    project,
    join(modelDirPath, "index.ts"),
    codeFirstRootIndexTemplate(v),
  );
  await writeScaffoldFile(
    project,
    join(upgradesDirPath, "index.ts"),
    codeFirstUpgradesIndexTemplate(),
  );

  await copyPreviousVersion(project, modelDirPath, v);
  await writeScaffoldFile(
    project,
    join(versionDirPath, "model.ts"),
    codeFirstModelTemplate(v),
  );
  await writeScaffoldFile(
    project,
    join(versionDirPath, "reducers.ts"),
    codeFirstReducersTemplate(v),
  );
  await writeScaffoldFile(
    project,
    join(testsDirPath, "model.test.ts"),
    codeFirstModelTestTemplate(v),
  );
  if (v.version > 1) {
    await writeScaffoldFile(
      project,
      join(upgradesDirPath, `v${v.version}.ts`),
      codeFirstUpgradeTransitionTemplate(v),
    );
    await writeScaffoldFile(
      project,
      join(upgradesDirPath, `v${v.version}.test.ts`),
      codeFirstUpgradeTestTemplate(v),
    );
  }

  await includeVersionInRootIndex(project, modelDirPath, v);
  await includeUpgradeTransition(project, upgradesDirPath, v);
  await registerCodeFirstDefinitionSource(projectDir, {
    specifier: `./document-models/${kebabCase(args.name)}/index.ts`,
    exportPath: [`${v.pascalCaseName}V${v.version}`],
  });
  await createOrUpdateManifest(
    { documentModels: [{ id: args.id, name: args.name }] },
    projectDir,
  );
  await refreshDocumentModelAggregateFiles({
    project,
    documentModelsDirPath,
  });
}
