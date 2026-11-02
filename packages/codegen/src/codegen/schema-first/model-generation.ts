import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { getDocumentModelVariableNames } from "name-builders";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Project } from "ts-morph";
import {
  getVariableDeclarationByTypeName,
  loadDocumentModelInDir,
  projectPath,
} from "utils";
import {
  generateAll,
  generateAllDocumentModels,
  generateAllEditors,
  generateDocumentModel,
  generateEditor,
} from "../generate.js";
import type {
  ModelGenerationSource,
  PlannedDocumentModel,
  PlannedModelExport,
} from "../model-generation-source.js";
import type { SchemaFirstModelGeneration } from "../model-generation.js";

export const schemaFirstModelGeneration: SchemaFirstModelGeneration = {
  mode: "schema-first",
  generateDocumentModel,
  async generateAllDocumentModels(project) {
    return {
      ...(await generateAllDocumentModels(project)),
      codeFirstDocumentModels: [],
    };
  },
  generateEditor,
  generateAllEditors,
  generateAll,
};

/** Where `tsMorphGenerateDocumentModel` writes `state`, and what it exports. */
function plan(
  state: DocumentModelGlobalState,
  project: Project,
  label: string,
): PlannedDocumentModel {
  const { kebabCaseDocumentType, pascalCaseDocumentType } =
    getDocumentModelVariableNames(state.name);
  const directory = projectPath(
    project,
    join("document-models", kebabCaseDocumentType),
  );
  return {
    state,
    id: state.id,
    label,
    directory,
    exportNames: state.specifications.map(
      ({ version }) => `${pascalCaseDocumentType}V${version}`,
    ),
  };
}

/** The specs `generateAllDocumentModels` would regenerate, read without writing. */
export const schemaFirstModelSource: ModelGenerationSource = {
  planDocumentModel: (state, project) =>
    plan(state, project, `the schema-first model "${state.name}"`),
  planAllDocumentModels(project) {
    const root = projectPath(project, "document-models");
    const loaded = (
      existsSync(root) ? readdirSync(root, { withFileTypes: true }) : []
    )
      .filter((dirent) => dirent.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((dirent) => ({
        dirName: dirent.name,
        state: loadDocumentModelInDir(dirent),
      }));
    return {
      models: loaded.flatMap(({ dirName, state }) =>
        state === undefined
          ? []
          : [
              plan(
                state,
                project,
                `document-models/${dirName}/${dirName}.json`,
              ),
            ],
      ),
      unreadableDirs: loaded
        .filter(({ state }) => state === undefined)
        .map(({ dirName }) => dirName),
    };
  },
  planExportNames(project, models): readonly PlannedModelExport[] {
    if (models.length === 0) return [];
    const root = projectPath(project, "document-models");
    const snapshot = new Project({
      compilerOptions: project.getCompilerOptions(),
      fileSystem: project.getFileSystem(),
      skipAddingFilesFromTsConfig: true,
    });
    snapshot.addSourceFilesAtPaths(join(root, "**/module.ts"));
    const prefix = `${root.replaceAll("\\", "/")}/`;
    for (const file of project.getSourceFiles()) {
      if (
        file.getBaseName() === "module.ts" &&
        file.getFilePath().startsWith(prefix)
      ) {
        snapshot.createSourceFile(file.getFilePath(), file.getFullText(), {
          overwrite: true,
        });
      }
    }
    const identity = (path: string) =>
      existsSync(path) ? realpathSync.native(path) : resolve(path);
    const rewritten = new Set(
      models.flatMap(({ state, directory }) =>
        state.specifications.map(({ version }) =>
          identity(join(directory, `v${version}`, "module.ts")),
        ),
      ),
    );
    return snapshot.getSourceFiles().flatMap((file) => {
      if (
        file.getBaseName() !== "module.ts" ||
        rewritten.has(identity(file.getFilePath()))
      )
        return [];
      const version = file.getDirectory().getBaseName();
      if (!/^v\d+$/.test(version)) return [];
      const declaration = getVariableDeclarationByTypeName(
        file,
        "DocumentModel",
      );
      return declaration === undefined
        ? []
        : [
            {
              name: `${declaration.getName()}V${version.slice(1)}`,
              file: relative(
                projectPath(project, "."),
                file.getFilePath(),
              ).replaceAll("\\", "/"),
            },
          ];
    });
  },
  generateDocumentModel,
  generateEditor,
};
