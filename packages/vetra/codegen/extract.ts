/**
 * Inverse of the `generate*` functions in `@powerhousedao/codegen`.
 *
 * `generate*` reads source-of-truth documents and writes code into the project.
 * `extract*` reads the project's existing code/files and produces the
 * `powerhouse/*` documents that would have produced that code. Intended as a
 * one-shot migration step toward the documents-as-source-of-truth model: run
 * extraction, save the documents into `specs/`, and from then on regenerate
 * from the specs.
 */
import {
  generateId,
  type DocumentModelDocument,
  type DocumentModelGlobalState,
  type DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import {
  getAppMetadata,
  getEditorMetadata,
  getOrCreateDirectory,
  getProcessorMetadata,
  getSubgraphMetadata,
  loadDocumentModelInDir,
} from "@powerhousedao/codegen/utils";
import { documentModelDocumentModelModule } from "document-model";
import { readdirSync } from "node:fs";
import type { Project } from "ts-morph";

const isDefined = <T>(v: T | undefined | null): v is T => v != null;

/* Import from gen/ directly to bypass the top-level barrel's `hooks.ts`,
 * which pulls in browser-only `@powerhousedao/reactor-browser`. */
import {
  createAppModuleDocument,
  type AppModuleDocument,
  type AppModuleGlobalState,
} from "../document-models/app-module/v1/gen/index.js";
import {
  createDocumentEditorDocument,
  type DocumentEditorDocument,
  type DocumentEditorGlobalState,
} from "../document-models/document-editor/v1/gen/index.js";
import {
  createProcessorModuleDocument,
  type ProcessorModuleDocument,
  type ProcessorModuleGlobalState,
} from "../document-models/processor-module/v1/gen/index.js";
import {
  createSubgraphModuleDocument,
  type SubgraphModuleDocument,
  type SubgraphModuleGlobalState,
} from "../document-models/subgraph-module/v1/gen/index.js";

/* Builds a `powerhouse/document-editor` document for each editor in the
 * project's `editors/` directory. Drive editors (powerhouse/document-drive)
 * are excluded — those are handled by `extractAppDocuments`, matching how
 * `generateAllEditors` / `generateAllApps` are split.
 */
export function extractEditorDocuments(
  project: Project,
): DocumentEditorDocument[] {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  return editorsDir
    .getDirectories()
    .map((dir) => getEditorMetadata(project, dir.getBaseName()))
    .filter(isDefined)
    .filter(
      ({ documentTypes }) =>
        !documentTypes.includes("powerhouse/document-drive"),
    )
    .map(({ name, documentTypes }) => {
      const global: DocumentEditorGlobalState = {
        name,
        documentTypes: documentTypes.map((documentType) => ({
          id: generateId(),
          documentType,
        })),
        status: "CONFIRMED",
      };
      const doc = createDocumentEditorDocument({ global });
      doc.header.name = name;
      return doc;
    });
}

/* Builds a `powerhouse/app` document for each drive editor (an editor whose
 * documentTypes include `powerhouse/document-drive`) — same selection
 * predicate used by `generateAllApps`.
 */
export function extractAppDocuments(project: Project): AppModuleDocument[] {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  return editorsDir
    .getDirectories()
    .map((dir) => getAppMetadata(project, dir.getBaseName()))
    .filter(isDefined)
    .map(({ name, allowedDocumentTypes, isDragAndDropEnabled }) => {
      const global: AppModuleGlobalState = {
        name,
        status: "CONFIRMED",
        allowedDocumentTypes:
          allowedDocumentTypes.length > 0 ? allowedDocumentTypes : null,
        isDragAndDropEnabled: isDragAndDropEnabled ?? true,
      };
      const doc = createAppModuleDocument({ global });
      doc.header.name = name;
      return doc;
    });
}

export function extractProcessorDocuments(
  project: Project,
): ProcessorModuleDocument[] {
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
  return processorsDir
    .getDirectories()
    .map((dir) => getProcessorMetadata(project, dir.getBaseName()))
    .map(({ processorName, processorApps, processorType, documentTypes }) => {
      const global: ProcessorModuleGlobalState = {
        name: processorName,
        // Inverse of the mapping in processor-generator.ts: the document
        // model stores `relational`; codegen consumes `relationalDb`.
        type: processorType === "relationalDb" ? "relational" : processorType,
        documentTypes: documentTypes.map((documentType) => ({
          id: generateId(),
          documentType,
        })),
        status: "CONFIRMED",
        processorApps: [...processorApps],
      };
      const doc = createProcessorModuleDocument({ global });
      doc.header.name = processorName;
      return doc;
    });
}

export function extractSubgraphDocuments(
  project: Project,
): SubgraphModuleDocument[] {
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  return subgraphsDir
    .getDirectories()
    .map((dir) => getSubgraphMetadata(project, dir.getBaseName()).subgraphName)
    .filter(isDefined)
    .map((name) => {
      const global: SubgraphModuleGlobalState = { name, status: "CONFIRMED" };
      const doc = createSubgraphModuleDocument({ global });
      doc.header.name = name;
      return doc;
    });
}

export function extractDocumentModelDocuments(
  project: Project,
): DocumentModelDocument[] {
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  return readdirSync(documentModelsDir.getPath(), { withFileTypes: true })
    .map(loadDocumentModelInDir)
    .filter(isDefined)
    .map(buildDocumentModelDocument);
}

function buildDocumentModelDocument(
  globalState: DocumentModelGlobalState,
): DocumentModelDocument {
  const state = documentModelDocumentModelModule.utils.createState({
    global: globalState,
  } as Partial<DocumentModelPHState>);
  const doc = documentModelDocumentModelModule.utils.createDocument(state);
  doc.header.name = globalState.name;
  return doc;
}

export type ExtractedDocuments = {
  documentModels: DocumentModelDocument[];
  editors: DocumentEditorDocument[];
  apps: AppModuleDocument[];
  processors: ProcessorModuleDocument[];
  subgraphs: SubgraphModuleDocument[];
};

/* Mirrors `generateAll` — runs every extractor against the project and
 * returns the full set of documents keyed by module type.
 */
export function extractAllDocuments(project: Project): ExtractedDocuments {
  return {
    documentModels: extractDocumentModelDocuments(project),
    editors: extractEditorDocuments(project),
    apps: extractAppDocuments(project),
    processors: extractProcessorDocuments(project),
    subgraphs: extractSubgraphDocuments(project),
  };
}
