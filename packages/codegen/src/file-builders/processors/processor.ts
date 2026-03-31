import type {
  ProcessorApp,
  ProcessorApps,
} from "@powerhousedao/shared/processors";
import { camelCase, kebabCase, pascalCase } from "change-case";
import path from "path";
import { factoryBuildersTemplate } from "templates";
import type { SourceFile } from "ts-morph";
import { ts, type Project } from "ts-morph";
import {
  buildTsMorphProject,
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "utils";
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
  const kebabCaseName = kebabCase(processorName);
  const camelCaseName = camelCase(processorName);
  const pascalCaseName = pascalCase(processorName);
  const processorsDirPath = path.join(rootDir, "processors");
  const dirPath = path.join(processorsDirPath, kebabCaseName);
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
      kebabCaseName,
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
  await project.save();
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
