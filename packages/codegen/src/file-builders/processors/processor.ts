import type {
  ProcessorApp,
  ProcessorApps,
} from "@powerhousedao/shared/processors";
import { camelCase, kebabCase, pascalCase } from "change-case";
import { createOrUpdateManifest } from "file-builders";
import path from "path";
import { factoryBuildersTemplate } from "templates";
import type { SourceFile } from "ts-morph";
import { ts, type Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
} from "utils";
import { tsMorphGenerateAnalyticsProcessor } from "./analytics.js";
import { tsMorphGenerateRelationalDbProcessor } from "./relational-db.js";

/**
 * Detects a hand-customized processor directory using a layout that predates
 * the current scaffold (class defined in index.ts, no processor.ts). When
 * present we leave the directory and surrounding wiring (factory-builders
 * file, manifest) untouched — the user owns it.
 */
function isCustomizedProcessorDir(
  processorDir: ReturnType<Project["getDirectory"]>,
) {
  if (!processorDir) return false;
  if (processorDir.getSourceFile("processor.ts")) return false;
  const indexFile = processorDir.getSourceFile("index.ts");
  if (!indexFile) return false;
  return indexFile.getClasses().some((c) => c.isExported());
}

export async function tsMorphGenerateProcessor(args: {
  project: Project;
  processorName: string;
  documentTypes: string[];
  processorType: "relationalDb" | "analytics";
  processorApps: ProcessorApps;
}) {
  const {
    project,
    processorName,
    documentTypes,
    processorType,
    processorApps,
  } = args;
  const kebabCaseName = kebabCase(processorName);
  const camelCaseName = camelCase(processorName);
  const pascalCaseName = pascalCase(processorName);
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
  const projectDir = processorsDir.getParentOrThrow().getPath();
  const processorsDirPath = processorsDir.getPath();
  const dirPath = path.join(processorsDirPath, kebabCaseName);
  await ensureDirectoriesExist(project, processorsDirPath, dirPath);

  if (isCustomizedProcessorDir(project.getDirectory(dirPath))) {
    const relativePath = path.relative(
      projectDir,
      path.join(dirPath, "index.ts"),
    );
    console.warn(
      `[codegen] Skipping processor scaffold for "${kebabCaseName}": legacy layout detected "${relativePath}"`,
    );
    return;
  }

  if (processorType === "analytics") {
    await tsMorphGenerateAnalyticsProcessor({
      processorName,
      documentTypes,
      camelCaseName,
      dirPath,
      kebabCaseName,
      pascalCaseName,
      processorsDirPath,
      project,
    });
  } else {
    await tsMorphGenerateRelationalDbProcessor({
      processorName,
      documentTypes,
      camelCaseName,
      dirPath,
      kebabCaseName,
      pascalCaseName,
      processorsDirPath,
      project,
    });
  }

  for (const processorApp of processorApps) {
    await updateFactoryBuildersFile({
      processorsDirPath,
      processorApp,
      project,
      camelCaseName,
      kebabCaseName,
    });
  }
  await createOrUpdateManifest(
    {
      processors: [{ name: processorName, id: kebabCaseName }],
    },
    projectDir,
  );
}

async function updateFactoryBuildersFile(v: {
  project: Project;
  processorsDirPath: string;
  processorApp: ProcessorApp;
  camelCaseName: string;
  kebabCaseName: string;
}) {
  const {
    project,
    processorsDirPath,
    processorApp,
    camelCaseName,
    kebabCaseName,
  } = v;
  const template = factoryBuildersTemplate;
  const filePath = path.join(processorsDirPath, `${processorApp}.ts`);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  if (!alreadyExists) {
    sourceFile.replaceWithText(template);
  }
  const name = `${camelCaseName}FactoryBuilder`;
  const moduleSpecifier = path.join("processors", kebabCaseName);

  const factoriesArrayName = "processorFactoryBuilders";

  let factoryBuildersArray = getFactoryBuildersArray(
    sourceFile,
    factoriesArrayName,
  );

  if (!factoryBuildersArray) {
    sourceFile.replaceWithText(template);
    factoryBuildersArray = getFactoryBuildersArray(
      sourceFile,
      factoriesArrayName,
    );
  }

  if (!factoryBuildersArray) {
    throw new Error(
      `Could not get factory builders array in file ${processorApp}.ts`,
    );
  }

  const importDeclaration = sourceFile
    .getImportDeclarations()
    .flatMap((importDeclaration) =>
      importDeclaration.getNamedImports().map((n) => n.getText()),
    )
    .find((n) => n === name);

  if (!importDeclaration) {
    sourceFile.addImportDeclaration({
      namedImports: [name],
      moduleSpecifier,
    });
  }

  const arrayElements = factoryBuildersArray
    .getElements()
    .map((e) => e.getText());

  if (!arrayElements.includes(name)) {
    factoryBuildersArray.addElement(name);
  }

  await formatSourceFileWithPrettier(sourceFile);
}

function getFactoryBuildersArray(sourceFile: SourceFile, name: string) {
  return sourceFile
    .getDescendantsOfKind(ts.SyntaxKind.VariableStatement)
    .flatMap((d) => d.getDescendantsOfKind(ts.SyntaxKind.VariableDeclaration))
    .find((d) => d.getName() === name)
    ?.getDescendantsOfKind(ts.SyntaxKind.ArrayLiteralExpression)
    .at(0);
}
