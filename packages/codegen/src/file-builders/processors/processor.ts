import {
  processorsFactoryTemplate,
  processorsIndexTemplate,
} from "@powerhousedao/codegen/templates";
import {
  buildTsMorphProject,
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import { camelCase, paramCase, pascalCase } from "change-case";
import path from "path";
import type { ProcessorApp, ProcessorApps } from "shared";
import { ts, type Project } from "ts-morph";
import { tsMorphGenerateAnalyticsProcessor } from "./analytics.js";
import { tsMorphGenerateRelationalDbProcessor } from "./relational-db.js";

export async function tsMorphGenerateProcessor(args: {
  processorName: string;
  documentTypes: string[];
  rootDir: string;
  processorType: "relationalDb" | "analytics";
  processorApps: ProcessorApps;
}) {
  const {
    processorName,
    documentTypes,
    rootDir,
    processorType,
    processorApps,
  } = args;
  const paramCaseName = paramCase(processorName);
  const camelCaseName = camelCase(processorName);
  const pascalCaseName = pascalCase(processorName);
  const processorsDirPath = path.join(rootDir, "processors");
  const dirPath = path.join(processorsDirPath, paramCaseName);
  const sourceFilesPath = path.join(processorsDirPath, "**/*");
  const project = buildTsMorphProject(rootDir);
  await ensureDirectoriesExist(project, processorsDirPath, dirPath);
  project.addSourceFilesAtPaths(sourceFilesPath);

  if (processorType === "analytics") {
    await tsMorphGenerateAnalyticsProcessor({
      processorName,
      documentTypes,
      rootDir,
      camelCaseName,
      dirPath,
      paramCaseName,
      pascalCaseName,
      processorsDirPath,
      project,
    });
  } else {
    await tsMorphGenerateRelationalDbProcessor({
      processorName,
      documentTypes,
      rootDir,
      camelCaseName,
      dirPath,
      paramCaseName,
      pascalCaseName,
      processorsDirPath,
      project,
    });
  }

  await updateIndexFile({ processorsDirPath, project });
  for (const processorApp of processorApps) {
    await updateFactoryFile({
      processorsDirPath,
      project,
      camelCaseName,
      dirPath,
      processorApp,
    });
    await updateAppProcessorsFile({
      processorsDirPath,
      processorApp,
      project,
      dirPath,
      pascalCaseName,
      camelCaseName,
    });
  }
  await project.save();
}

async function updateAppProcessorsFile(args: {
  project: Project;
  processorsDirPath: string;
  processorApp: ProcessorApp;
  dirPath: string;
  pascalCaseName: string;
  camelCaseName: string;
}) {
  const {
    project,
    processorsDirPath,
    processorApp,
    dirPath,
    pascalCaseName,
    camelCaseName,
  } = args;
  const processorFilePath = path.join(processorsDirPath, `${processorApp}.ts`);
  const { sourceFile } = getOrCreateSourceFile(project, processorFilePath);

  const processorClassName = `${pascalCaseName}Processor`;
  const processorClassModuleSpecifier = `./${path.join(
    path.basename(dirPath),
    "index.js",
  )}`;
  const processorFactoryName = `${camelCaseName}ProcessorFactory`;
  const processorFactoryModuleSpecifier = `./${path.join(
    path.basename(dirPath),
    "factory.js",
  )}`;
  const exportedNames = sourceFile
    .getExportDeclarations()
    .flatMap((e) => e.getNamedExports().map((n) => n.getText()));

  if (!exportedNames.includes(processorClassName)) {
    sourceFile.addExportDeclaration({
      namedExports: [processorClassName],
      moduleSpecifier: processorClassModuleSpecifier,
    });
  }

  if (!exportedNames.includes(processorFactoryName)) {
    sourceFile.addExportDeclaration({
      namedExports: [processorFactoryName],
      moduleSpecifier: processorFactoryModuleSpecifier,
    });
  }

  await formatSourceFileWithPrettier(sourceFile);
}

async function updateIndexFile(v: {
  project: Project;
  processorsDirPath: string;
}) {
  const { project, processorsDirPath } = v;
  const template = processorsIndexTemplate();
  const indexFilePath = path.join(processorsDirPath, "index.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    indexFilePath,
  );
  if (!alreadyExists) {
    sourceFile.replaceWithText(template);
  }
  const exportNames = sourceFile
    .getExportDeclarations()
    .flatMap((e) => e.getNamedExports().map((n) => n.getText()));

  if (!exportNames.includes("processorFactory")) {
    sourceFile.addExportDeclaration({
      namedExports: ["processorFactory"],
      moduleSpecifier: "./factory.ts",
    });
  }
  await formatSourceFileWithPrettier(sourceFile);
}

async function updateFactoryFile(v: {
  project: Project;
  processorsDirPath: string;
  processorApp: ProcessorApp;
  dirPath: string;
  camelCaseName: string;
}) {
  const { project, processorsDirPath, processorApp, dirPath, camelCaseName } =
    v;
  const template = processorsFactoryTemplate();
  const filePath = path.join(processorsDirPath, "factory.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  if (!alreadyExists) {
    sourceFile.replaceWithText(template);
  }
  const processorFactoryName = `${camelCaseName}ProcessorFactory`;
  const processorFactoryModuleSpecifier = `./${path.join(
    path.basename(dirPath),
    "factory.js",
  )}`;
  const addFactoriesFunctionName = camelCase(
    `add_${processorApp}_ProcessorFactories`,
  );
  const factoriesArrayName = camelCase(`${processorApp}ProcessorFactories`);
  const addProcessorFactoriesFunction = sourceFile.getFunctionOrThrow(
    addFactoriesFunctionName,
  );
  const functionBody = addProcessorFactoriesFunction
    .getBodyOrThrow()
    .asKindOrThrow(ts.SyntaxKind.Block);

  const factoriesArray = functionBody
    .getDescendantsOfKind(ts.SyntaxKind.VariableStatement)
    .flatMap((d) => d.getDescendantsOfKind(ts.SyntaxKind.VariableDeclaration))
    .find((d) => d.getName() === factoriesArrayName)
    ?.getDescendantsOfKind(ts.SyntaxKind.ArrayLiteralExpression)
    .at(0);

  if (!factoriesArray) {
    throw new Error(
      `"${factoriesArrayName}" array is missing in "${addFactoriesFunctionName}"`,
    );
  }

  const factoryFunctionInvocation = `${processorFactoryName}(module)`;

  const arrayElements = factoriesArray.getElements().map((e) => e.getText());

  if (!arrayElements.includes(factoryFunctionInvocation)) {
    functionBody.insertStatements(
      0,
      `const { ${processorFactoryName} } = await import("${processorFactoryModuleSpecifier}");`,
    );
    factoriesArray.addElement(factoryFunctionInvocation);
  }

  await formatSourceFileWithPrettier(sourceFile);
}
