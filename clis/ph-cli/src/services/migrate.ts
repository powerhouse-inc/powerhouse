import {
  connectEntrypointTemplate,
  dockerfileTemplate,
  indexHtmlTemplate,
  indexTsTemplate,
  nginxConfTemplate,
  packageJsonExportsTemplate,
  packageJsonScriptsTemplate,
  switchboardEntrypointTemplate,
  syncAndPublishWorkflowTemplate,
  tsConfigTemplate,
} from "@powerhousedao/codegen/templates";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "path";
import { readPackage } from "read-pkg";
import type {
  ArrayLiteralExpression,
  ObjectLiteralExpression,
  SourceFile,
  StringLiteral,
} from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { writePackage } from "write-package";
import { generate } from "../commands/generate.js";
import type { GenerateArgs, MigrateArgs } from "../types.js";
import { startGenerate } from "./generate.js";

export async function startMigrate({ useHygen = false }: MigrateArgs) {
  await migratePackageJson();
  await migrateTsConfig();
  await migrateIndexHtml();
  await migrateCIFiles();
  await runGenerateOnAllDocumentModels(useHygen);
  await runGenerateOnAllEditors(useHygen);
  const project = new Project({
    tsConfigFilePath: path.resolve("tsconfig.json"),
    compilerOptions: {
      verbatimModuleSyntax: false,
    },
  });
  deleteLegacyEditorDirIndexFiles(project);
  migrateEditorFiles(project);
  migrateRootIndex(project);
  removeZDotSchemaUsage(project);
  removeCreatorsUsage(project);
  removeUtilsDefaultExportUsage(project);
  fixImports(project);
}

/** Ensure that the project package.json has the correct scripts and exports. */
async function migratePackageJson() {
  const packageJson = await readPackage();
  const existingScripts = packageJson.scripts;
  const existingExports =
    !!packageJson.exports &&
    !Array.isArray(packageJson.exports) &&
    typeof packageJson.exports !== "string"
      ? packageJson.exports
      : {};
  const newScripts = {
    ...existingScripts,
    ...packageJsonScriptsTemplate,
  };
  const newExports = {
    ...existingExports,
    ...packageJsonExportsTemplate,
  };
  packageJson.scripts = newScripts;
  packageJson.exports = newExports;
  await writePackage(packageJson);
}

/** Ensure that the project index.html matches the boilerplate index.html. */
async function migrateIndexHtml() {
  const indexHtmlPath = path.join(process.cwd(), "index.html");
  await writeFile(indexHtmlPath, indexHtmlTemplate);
}

/** Ensure that the project tsconfig.json matches the boilerplate tsconfig.json. */
async function migrateTsConfig() {
  const tsConfigPath = path.join(process.cwd(), "tsconfig.json");
  await writeFile(tsConfigPath, tsConfigTemplate);
}

/** Check if a file exists */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Write a file with optional warning if it already exists */
async function writeFileWithWarning(
  filePath: string,
  content: string,
): Promise<void> {
  const exists = await fileExists(filePath);
  if (exists) {
    console.warn(`Warning: Overwriting existing file: ${filePath}`);
  }
  await writeFile(filePath, content);
}

/** Add CI/CD workflow and Docker files to the project. */
async function migrateCIFiles() {
  const cwd = process.cwd();

  try {
    // Create directories if they don't exist
    await mkdir(path.join(cwd, ".github/workflows"), { recursive: true });
    await mkdir(path.join(cwd, "docker"), { recursive: true });

    // Write CI/CD workflow
    await writeFileWithWarning(
      path.join(cwd, ".github/workflows/sync-and-publish.yml"),
      syncAndPublishWorkflowTemplate,
    );

    // Write Docker files
    await writeFileWithWarning(
      path.join(cwd, "Dockerfile"),
      dockerfileTemplate,
    );
    await writeFileWithWarning(
      path.join(cwd, "docker/nginx.conf"),
      nginxConfTemplate,
    );
    await writeFileWithWarning(
      path.join(cwd, "docker/connect-entrypoint.sh"),
      connectEntrypointTemplate,
    );
    await writeFileWithWarning(
      path.join(cwd, "docker/switchboard-entrypoint.sh"),
      switchboardEntrypointTemplate,
    );
  } catch (error) {
    console.error("Error migrating CI files:", error);
    throw error;
  }
}

/** Ensure that the project index.ts file uses the new exports for editors and document models */
function migrateRootIndex(project: Project) {
  const indexPath = path.join(process.cwd(), "index.ts");
  let source = project.getSourceFile(indexPath);
  if (!source) {
    source = project.createSourceFile(indexPath);
  }
  source.replaceWithText(indexTsTemplate);
  project.saveSync();
}

/** Ensure that the project's editor.tsx files use default exports for lazy loading */
function migrateEditorFiles(project: Project) {
  const editorsPath = path.join(process.cwd(), "editors");
  const dirs = readdirSync(editorsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const dir of dirs) {
    const editorFilePath = path.join(editorsPath, dir, "editor.tsx");
    const source = project.getSourceFile(editorFilePath);
    if (!source) continue;
    const text = source.getFullText();
    const replaceNamedExportWithDefaultExport = text.replace(
      "export function Editor",
      "export default function Editor",
    );
    source.replaceWithText(replaceNamedExportWithDefaultExport);
    project.saveSync();
  }
}

/** Delete the legacy index files in editor directories which are now replaced by module.ts files */
function deleteLegacyEditorDirIndexFiles(project: Project) {
  const editorsPath = path.join(process.cwd(), "editors");
  const dirs = readdirSync(editorsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const dir of dirs) {
    const indexFilePath = path.join(editorsPath, dir, "index.ts");
    const source = project.getSourceFile(indexFilePath);
    if (!source) continue;
    source.delete();
    project.saveSync();
  }
}

/** Remove usage of the `z` re-export of document model schemas which caused naming conflicts */
function removeZDotSchemaUsage(project: Project) {
  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    const path = sourceFile.getFilePath();
    if (!path.includes(process.cwd())) continue;
    if (path.includes("zod.ts")) continue;
    const text = sourceFile.getFullText();
    if (/import\s+(?:\{\s*z\s*\}|z)\s+from\s+['"]zod['"]/.test(text)) continue;
    const withoutZDot = text.replace(/z\./g, "");
    sourceFile.replaceWithText(withoutZDot);
    project.saveSync();
  }
}

/** Remove usage of the `creators` as an aliased full module export which is no longer needed */
function removeCreatorsUsage(project: Project) {
  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    const path = sourceFile.getFilePath();
    if (!path.includes(process.cwd())) continue;
    const creatorsInvocations = sourceFile
      .getStatements()
      .filter(
        (statement) =>
          statement.getKind() === SyntaxKind.PropertyAccessExpression,
      )
      .filter((statement) => statement.getText().includes("creators."));
    for (const creatorInvocation of creatorsInvocations) {
      const withoutCreators = creatorInvocation
        .getText()
        .replace(/creators\./g, "");
      creatorInvocation.replaceWithText(withoutCreators);
      project.saveSync();
    }
  }
}

/** Remove usage of the `utils` import which is no longer exported as a default import */
function removeUtilsDefaultExportUsage(project: Project) {
  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    const path = sourceFile.getFilePath();
    if (!path.includes(process.cwd())) continue;
    const statement = sourceFile
      .getImportDeclarations()
      .find((importDeclaration) =>
        importDeclaration.getText().includes("import utils"),
      );
    if (statement) {
      statement.remove();
      project.saveSync();
    }
  }
}

/** Fix missing imports in the project */
function fixImports(project: Project) {
  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    const path = sourceFile.getFilePath();
    if (!path.includes(process.cwd())) continue;
    sourceFile.fixMissingImports(undefined, {
      importModuleSpecifierPreference: "project-relative",
      autoImportSpecifierExcludeRegexes: ["document-model", "document-drive"],
      importModuleSpecifierEnding: "js",
      preferTypeOnlyAutoImports: false,
    });
    sourceFile.fixUnusedIdentifiers();

    project.saveSync();
  }
}

/** Run the generate command on all document models */
async function runGenerateOnAllDocumentModels(useHygen: boolean) {
  await startGenerate({
    useHygen,
  } as GenerateArgs);
}

/** Run the generate command on all editors */
async function runGenerateOnAllEditors(useHygen: boolean) {
  const editorsPath = path.join(process.cwd(), "editors");
  const dirs = (await readdir(editorsPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const dir of dirs) {
    const moduleFilePath = path.join(editorsPath, dir, "module.ts");
    const indexFilePath = path.join(editorsPath, dir, "index.ts");
    const hasModuleFile = existsSync(moduleFilePath);
    const hasIndexFile = existsSync(indexFilePath);
    if (!hasModuleFile && !hasIndexFile) {
      continue;
    }
    const filePathToUse = hasModuleFile ? moduleFilePath : indexFilePath;
    const { id, name, documentTypes, isDriveEditor } =
      extractEditorModuleInfo(filePathToUse);

    if (!name) {
      throw new Error(`Editor ${dir} is missing name`);
    }
    if (!id) {
      throw new Error(`Editor ${dir} is missing id`);
    }
    if (isDriveEditor) {
      const configFilePath = path.join(editorsPath, dir, "config.ts");
      const hasConfigFile = existsSync(configFilePath);
      const allowedDocumentTypes = hasConfigFile
        ? extractAllowedDocumentTypes(configFilePath)
        : undefined;
      const args = {
        driveEditorName: name,
        driveEditorId: id,
        driveEditorDirName: dir,
        allowedDocumentTypes,
        useHygen,
      } as GenerateArgs;
      await startGenerate(args);
    } else {
      const args = {
        editorName: name,
        editorId: id,
        editorDirName: dir,
        documentType: documentTypes?.[0],
        useHygen,
      } as GenerateArgs;
      await startGenerate(args);
    }
  }
}

/** Extract the name, id, document types, and whether the editor is a drive editor from the editor module */
function extractEditorModuleInfo(filePath: string) {
  const project = new Project({
    tsConfigFilePath: path.resolve("tsconfig.json"),
    compilerOptions: {
      verbatimModuleSyntax: false,
    },
  });
  const sourceFile = project.getSourceFileOrThrow(filePath);
  const moduleDeclaration = getVariableDeclarationByTypeName(
    sourceFile,
    "EditorModule",
  );

  const variable = moduleDeclaration?.getInitializerIfKind(
    SyntaxKind.ObjectLiteralExpression,
  );
  const documentTypes = getObjectProperty(
    variable,
    "documentTypes",
    SyntaxKind.ArrayLiteralExpression,
  )
    ?.getElements()
    .map((element) => element.getText())
    .map((text) => text.replace(/["']/g, ""));

  const configProperty = getObjectProperty(
    variable,
    "config",
    SyntaxKind.ObjectLiteralExpression,
  );

  const id = getStringLiteralValue(
    getObjectProperty(configProperty, "id", SyntaxKind.StringLiteral),
  );

  const name = getStringLiteralValue(
    getObjectProperty(configProperty, "name", SyntaxKind.StringLiteral),
  );
  const isDriveEditor = documentTypes?.includes("powerhouse/document-drive");
  return { id, name, documentTypes, isDriveEditor };
}

/** Extract the allowed document types from the drive editor config */
function extractAllowedDocumentTypes(filePath: string) {
  const project = new Project({
    tsConfigFilePath: path.resolve("tsconfig.json"),
    compilerOptions: {
      verbatimModuleSyntax: false,
    },
  });
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) return;
  const configVariableDeclaration = getVariableDeclarationByTypeName(
    sourceFile,
    "PHDriveEditorConfig",
  );
  const configVariable = configVariableDeclaration?.getInitializerIfKind(
    SyntaxKind.ObjectLiteralExpression,
  );
  if (!configVariable) return;
  const allowedDocumentTypes = getArrayLiteralExpressionElementsText(
    getObjectProperty(
      configVariable,
      "allowedDocumentTypes",
      SyntaxKind.ArrayLiteralExpression,
    ),
  );
  return allowedDocumentTypes;
}

function getVariableDeclarationByTypeName(
  sourceFile: SourceFile,
  typeName: string,
) {
  const variableDeclarations = sourceFile.getVariableDeclarations();
  return variableDeclarations.find((declaration) =>
    declaration.getType().getText().includes(typeName),
  );
}

function getStringLiteralValue(stringLiteral: StringLiteral | undefined) {
  return stringLiteral?.getText().replace(/["']/g, "");
}

function getObjectProperty<T extends SyntaxKind>(
  object: ObjectLiteralExpression | undefined,
  propertyName: string,
  propertyType: T,
) {
  return object
    ?.getProperty(propertyName)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getChildren()
    .find((child) => child.getKind() === propertyType)
    ?.asKind(propertyType);
}

function getArrayLiteralExpressionElementsText(
  arrayLiteralExpression: ArrayLiteralExpression | undefined,
) {
  return arrayLiteralExpression
    ?.getElements()
    .map((element) => element.getText())
    .map((text) => text.replace(/["']/g, ""));
}
