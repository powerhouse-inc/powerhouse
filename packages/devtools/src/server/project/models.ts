import type {
  ProjectDiagnostic,
  ProjectDocumentModel,
  ProjectDocumentModelVersion,
  ProjectOperation,
} from "../../project-types.js";
import {
  type DefinitionDiagnostic,
  type DocumentModelGlobalState,
  DocumentModelGlobalStateSchema,
  type DocumentSpecification,
  type OperationSpecification,
} from "@powerhousedao/shared/document-model";
import {
  checkProjectDefinitions,
  documentModelChecks,
  type NormalizedDocumentModelArtifact,
} from "document-model/tooling";
import { posix } from "node:path";
import { readProjectDefinitions } from "@powerhousedao/codegen/utils";
import { byKey, readText } from "./project-fs.js";

export type ProjectModel = {
  summary: Omit<ProjectDocumentModel, "checks">;
  specifications: ProjectDocumentModelVersion[];
  /** The error diagnostics about this model, in the report's order. */
  errors: ProjectDiagnostic[];
};

export type ProjectModels = {
  /** POSIX, relative to the project. */
  documentModelsDir: string;
  /** Sorted by document type. */
  models: ProjectModel[];
  /** Every diagnostic that is not an error of one listed model. */
  diagnostics: ProjectDiagnostic[];
  /** Absolute paths of the modules the code-first sources and the project's scalars evaluated. */
  importedFiles: string[];
  /** A source did not import, so the files it would have evaluated are unknown. */
  importFailed: boolean;
};

/** The module the loader imports the project's scalars from. */
const PROJECT_SCALARS = "./scalars/index.ts";

const withoutDotSlash = (specifier: string) => specifier.replace(/^\.\//, "");

function projectDiagnostic(
  diagnostic: DefinitionDiagnostic,
): ProjectDiagnostic {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.source !== undefined && {
      file: withoutDotSlash(diagnostic.source.specifier),
    }),
    repair: diagnostic.repair,
  };
}

function operation(specification: OperationSpecification): ProjectOperation {
  return {
    id: specification.id,
    name: specification.name ?? "",
    scope: specification.scope === "local" ? "local" : "global",
    description: specification.description ?? "",
    schema: specification.schema ?? "",
    errors: specification.errors.map((error) => ({
      name: error.name ?? "",
      code: error.code ?? "",
      description: error.description ?? "",
    })),
    examples: specification.examples.map(({ value }) => value),
  };
}

function version(
  specification: DocumentSpecification,
): ProjectDocumentModelVersion {
  const { global, local } = specification.state;
  return {
    version: specification.version,
    changeLog: specification.changeLog,
    state: {
      global: { schema: global.schema, initialValue: global.initialValue },
      local:
        local.schema.trim() === ""
          ? null
          : { schema: local.schema, initialValue: local.initialValue },
    },
    modules: specification.modules.map((module) => ({
      id: module.id,
      name: module.name,
      description: module.description ?? "",
      operations: module.operations.map(operation),
    })),
  };
}

/**
 * One model in full. `specifications` are the versions the
 * model serves, ascending.
 */
function projectModel(model: {
  specifier: string;
  global: DocumentModelGlobalState;
  specifications: DocumentSpecification[];
  errors: readonly DefinitionDiagnostic[];
}): ProjectModel {
  const source = withoutDotSlash(model.specifier);
  const folder = posix.dirname(source);
  const stored = source.endsWith(".json");
  const specifications = model.specifications.map(version);
  const latest = specifications.at(-1);
  return {
    summary: {
      documentType: model.global.id,
      name: model.global.name,
      extension: model.global.extension,
      description: model.global.description,
      author: model.global.author.name,
      authorWebsite: model.global.author.website || null,
      authoring: stored ? "legacy" : "current",
      source,
      folder,
      versions: [
        ...new Set(
          specifications.map((specification) => specification.version),
        ),
      ],
      modules: latest?.modules.length ?? 0,
      operations:
        latest?.modules.reduce(
          (count, module) => count + module.operations.length,
          0,
        ) ?? 0,
    },
    specifications,
    errors: model.errors.map(projectDiagnostic),
  };
}

/** The stored specification as its file holds it, when it is a document model's state. */
function readStoredState(
  root: string,
  specifier: string,
): DocumentModelGlobalState | undefined {
  try {
    const parsed = DocumentModelGlobalStateSchema().safeParse(
      JSON.parse(readText(root, withoutDotSlash(specifier)) ?? ""),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** One folder's claim to a document type: what loaded from it, or its stored file when nothing did. */
type Candidate = Parameters<typeof projectModel>[0] & {
  documentType: string;
  folder: string;
  sources: ReadonlySet<string>;
};

const folderOf = (specifier: string) =>
  posix.dirname(withoutDotSlash(specifier));

/**
 * Reads the project's document models with the loader and the checks
 * `ph model check` uses. A stored model whose definition does not load is
 * still listed, from its file, with the errors that kept it from loading.
 * When two folders declare one document type, the folder that loaded wins,
 * then the first by name, and a diagnostic names both. A project whose
 * configuration cannot be read has no known list of models, so that throws.
 * Aborting `signal` stops the loader, which otherwise waits for as long as a
 * code-first module takes to evaluate.
 */
export async function readProjectModels(
  root: string,
  signal?: AbortSignal,
): Promise<ProjectModels> {
  return await readProjectDefinitions(
    root,
    async (project, modules) => {
      const unconfigured = project.diagnostics.find(
        ({ phase, severity }) =>
          phase === "configuration" && severity === "error",
      );
      if (unconfigured !== undefined) {
        throw new Error(`${unconfigured.message} ${unconfigured.repair}`);
      }
      const report = await checkProjectDefinitions(project, {
        checks: documentModelChecks,
      });

      // Artifacts are sorted by document type, then version.
      const loaded = [
        ...Map.groupBy(
          project.artifacts,
          ({ documentType, source }) =>
            `${documentType}\0${folderOf(source.specifier)}`,
        ).values(),
      ].map((artifacts): Candidate => {
        const latest = artifacts.at(-1)!;
        return {
          documentType: latest.documentType,
          folder: folderOf(latest.source.specifier),
          sources: new Set(artifacts.map(({ source }) => source.specifier)),
          specifier: latest.source.specifier,
          global: latest.documentModel.global,
          specifications: artifacts.flatMap((artifact) => {
            const served = servedSpecification(artifact);
            return served === undefined ? [] : [served];
          }),
          errors: [],
        };
      });
      const loadedSources = new Set(
        project.artifacts.map(({ source }) => source.specifier),
      );
      const unloaded = project.sourceSet.stored.flatMap(
        ({ specifier }): Candidate[] => {
          if (loadedSources.has(specifier)) return [];
          const global = readStoredState(root, specifier);
          if (global === undefined) return [];
          return [
            {
              documentType: global.id,
              folder: folderOf(specifier),
              sources: new Set([specifier]),
              specifier,
              global,
              specifications: global.specifications.toSorted(
                (left, right) => left.version - right.version,
              ),
              errors: [],
            },
          ];
        },
      );

      const duplicates: ProjectDiagnostic[] = [];
      const claimed = new Set<DefinitionDiagnostic>();
      const models = [
        ...Map.groupBy(
          [
            ...loaded.sort(byKey(({ folder }) => folder)),
            ...unloaded.sort(byKey(({ folder }) => folder)),
          ],
          ({ documentType }) => documentType,
        ),
      ].map(([documentType, [winner, ...others]]) => {
        for (const other of others) {
          duplicates.push({
            severity: "error",
            message: `${winner.folder} and ${other.folder} both declare the document type ${documentType}. Only ${winner.folder} is read.`,
            file: withoutDotSlash(other.specifier),
            repair: `Give the model in ${other.folder} its own document type, or remove the folder.`,
          });
        }
        const elsewhere = new Set(
          others.flatMap(({ sources }) => [...sources]),
        );
        const errors = report.diagnostics.filter(
          ({ severity, definition, source }) => {
            if (severity !== "error") return false;
            const from = source?.specifier ?? "";
            if (winner.sources.has(from)) return true;
            return (
              !elsewhere.has(from) &&
              definition?.kind === "document-model" &&
              definition.key === documentType
            );
          },
        );
        for (const error of errors) claimed.add(error);
        return projectModel({ ...winner, errors });
      });

      return {
        documentModelsDir: withoutDotSlash(
          project.sourceSet.documentModelsDir ?? "./document-models",
        ),
        models: models.sort(byKey(({ summary }) => summary.documentType)),
        diagnostics: [
          ...report.diagnostics
            .filter((diagnostic) => !claimed.has(diagnostic))
            .map(projectDiagnostic),
          ...duplicates,
        ],
        importedFiles: [
          ...new Set(
            [
              ...project.sourceSet.sources.map(({ specifier }) => specifier),
              PROJECT_SCALARS,
            ].flatMap((specifier) => modules.importedFiles(specifier)),
          ),
        ],
        importFailed: report.diagnostics.some(
          ({ phase, severity }) => phase === "import" && severity === "error",
        ),
      };
    },
    { allowMissingConfig: true, ...(signal !== undefined && { signal }) },
  );
}

/** The specification an artifact serves. Each artifact of a family carries the whole history. */
function servedSpecification(artifact: NormalizedDocumentModelArtifact) {
  const { specifications } = artifact.documentModel.global;
  return (
    specifications.find(({ version }) => version === artifact.version) ??
    specifications.at(-1)
  );
}
