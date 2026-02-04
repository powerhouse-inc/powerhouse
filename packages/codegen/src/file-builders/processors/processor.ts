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
import { type Project } from "ts-morph";
import { tsMorphGenerateAnalyticsProcessor } from "./analytics.js";
import { tsMorphGenerateRelationalDbProcessor } from "./relational-db.js";

export function tsMorphGenerateProcessor(args: {
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

  makeIndexFile({
    project,
    processorsDirPath,
  });

  makeFactoryFile({
    project,
    processorsDirPath,
  });

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
    project.saveSync();
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
    project.saveSync();
  }

  updateIndexFile({ processorsDirPath, project });
  project.saveSync();
}

function makeIndexFile(v: { project: Project; processorsDirPath: string }) {
  const template = processorsIndexTemplate();
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.processorsDirPath, "index.ts"),
  );
  if (alreadyExists) return;
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function makeFactoryFile(v: { project: Project; processorsDirPath: string }) {
  const template = processorsFactoryTemplate();
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    path.join(v.processorsDirPath, "factory.ts"),
  );
  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

function updateIndexFile(v: { project: Project; processorsDirPath: string }) {
  const { project, processorsDirPath } = v;
  const indexFilePath = path.join(processorsDirPath, "index.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    indexFilePath,
  );
  const processorsDir = project.getDirectoryOrThrow(processorsDirPath);
  const processorDirs = processorsDir.getDescendantDirectories();
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
        ".",
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
    .map((c) => ({
      namedExports: [c.name],
      moduleSpecifier: `./${path.posix.join(
        ".",
        c.dirName,
        c.fileName.replace(".ts", ".js"),
      )}`,
    }));

  for (const d of factoryExportDeclarations) {
    if (
      !sourceFile.getExportDeclaration((e) =>
        e.getNamedExports().some((e) => d.namedExports.includes(e.getName())),
      )
    ) {
      sourceFile.addExportDeclaration(d);
    }
  }
  formatSourceFileWithPrettier(sourceFile);
}
