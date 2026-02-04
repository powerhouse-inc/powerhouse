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
import { ts, type Project } from "ts-morph";
import { tsMorphGenerateAnalyticsProcessor } from "./analytics.js";
import { tsMorphGenerateRelationalDbProcessor } from "./relational-db.js";

export async function tsMorphGenerateProcessor(args: {
  name: string;
  documentTypes: string[];
  rootDir: string;
  processorType: "relationalDb" | "analytics";
}) {
  const { name, documentTypes, rootDir, processorType } = args;
  const paramCaseName = paramCase(name);
  const camelCaseName = camelCase(name);
  const pascalCaseName = pascalCase(name);
  const processorsDirPath = path.join(rootDir, "processors");
  const dirPath = path.join(processorsDirPath, paramCaseName);
  const sourceFilesPath = path.join(processorsDirPath, "**/*");
  const project = buildTsMorphProject(rootDir);
  ensureDirectoriesExist(project, processorsDirPath, dirPath);
  project.addSourceFilesAtPaths(sourceFilesPath);

  if (processorType === "analytics") {
    tsMorphGenerateAnalyticsProcessor({
      name,
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
    tsMorphGenerateRelationalDbProcessor({
      name,
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

  updateIndexFile({ processorsDirPath, project });
  updateFactoryFile({ processorsDirPath, project });
  await project.save();
}

function updateIndexFile(v: { project: Project; processorsDirPath: string }) {
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
  const processorsDir = project.getDirectoryOrThrow(processorsDirPath);
  const processorDirs = processorsDir.getDirectories();
  const indexFiles = processorDirs
    .flatMap((d) => d.getSourceFile("index.ts"))
    .filter((f) => f !== undefined);
  const processorExportDeclarations = indexFiles
    .flatMap((f) => f.getClasses())
    .filter(
      (c) =>
        c.getExtends()?.getFullText().includes("RelationalDbProcessor") ||
        c.getImplements().some((i) => i.getFullText().includes("IProcessor")),
    )
    .map((c) => {
      const name = c.getNameOrThrow();
      const file = c.getSourceFile();
      const fileName = file.getBaseName();
      const dirName = file.getDirectory().getBaseName();
      return {
        name,
        fileName,
        dirName,
      };
    })
    .map((c) => ({
      namedExports: [c.name],
      moduleSpecifier: `./${path.posix.join(
        c.dirName,
        c.fileName.replace(".ts", ".js"),
      )}`,
    }));
  for (const d of processorExportDeclarations) {
    if (
      !sourceFile.getExportDeclaration((e) =>
        e.getNamedExports().some((e) => d.namedExports.includes(e.getName())),
      )
    ) {
      sourceFile.addExportDeclaration(d);
    }
  }
  const factoryFiles = processorDirs
    .flatMap((d) => d.getSourceFile("factory.ts"))
    .filter((f) => f !== undefined);
  const factoryExportDeclarations = factoryFiles
    .flatMap((f) => f.getVariableDeclarations())
    .filter((d) => d.getName().includes("ProcessorFactory"))
    .map((v) => {
      const name = v.getName();
      const file = v.getSourceFile();
      const fileName = file.getBaseName();
      const dirName = file.getDirectory().getBaseName();
      return {
        name,
        fileName,
        dirName,
      };
    })
    .map((v) => ({
      namedExports: [v.name],
      moduleSpecifier: `./${path.posix.join(
        v.dirName,
        v.fileName.replace(".ts", ".js"),
      )}`,
    }));

  for (const d of [
    { namedExports: ["processorFactory"], moduleSpecifier: "./factory.js" },
    ...factoryExportDeclarations,
  ]) {
    if (
      !sourceFile.getExportDeclaration((e) =>
        e.getNamedExports().some((e) => d.namedExports.includes(e.getName())),
      )
    ) {
      sourceFile.addExportDeclaration(d);
    }
  }
  formatSourceFileWithPrettier(sourceFile);
  sourceFile.saveSync();
}

function updateFactoryFile(v: { project: Project; processorsDirPath: string }) {
  const { project, processorsDirPath } = v;
  const template = processorsFactoryTemplate();
  const filePath = path.join(processorsDirPath, "factory.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  if (!alreadyExists) {
    sourceFile.replaceWithText(template);
  }
  const processorFactoryFunction = sourceFile
    .getVariableDeclarationOrThrow("processorFactory")
    .getFirstChildByKindOrThrow(ts.SyntaxKind.ArrowFunction);
  const functionBody = processorFactoryFunction
    .getBody()
    .asKindOrThrow(ts.SyntaxKind.Block);

  const factoriesArray = functionBody
    .getDescendantsOfKind(ts.SyntaxKind.VariableStatement)
    .flatMap((d) => d.getDescendantsOfKind(ts.SyntaxKind.VariableDeclaration))
    .find((d) => d.getName() === "factories")
    ?.getDescendantsOfKind(ts.SyntaxKind.ArrayLiteralExpression)
    .at(0);

  if (!factoriesArray) {
    throw new Error("`factories` array is missing in `processorFactory`");
  }
  const processorsDir = project.getDirectoryOrThrow(processorsDirPath);
  const processorDirs = processorsDir.getDirectories();
  const factoryFiles = processorDirs
    .flatMap((d) => d.getSourceFile("factory.ts"))
    .filter((f) => f !== undefined);
  const factoryNames = factoryFiles
    .flatMap((f) => f.getVariableDeclarations())
    .filter((d) => d.getName().includes("ProcessorFactory"))
    .map((v) => v.getName());

  const factoriesArrayElements = factoriesArray
    .getElements()
    .map((e) => e.getText());

  for (const name of factoryNames) {
    const callExpression = `${name}(module)`;
    if (!factoriesArrayElements.includes(callExpression)) {
      factoriesArray.addElement(callExpression, { useNewLines: true });
    }
  }

  sourceFile.fixMissingImports(undefined, {
    importModuleSpecifierEnding: "js",
  });
  formatSourceFileWithPrettier(sourceFile);
  sourceFile.saveSync();
}
