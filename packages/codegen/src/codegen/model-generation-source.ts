import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { Project } from "ts-morph";
import type { GenerateEditorRequest } from "./model-generation.js";

/** What generating one model would write, known before anything is written. */
export type PlannedDocumentModel = {
  readonly state: DocumentModelGlobalState;
  readonly id: string;
  /** Names the model's source in errors. */
  readonly label: string;
  /** The absolute directory the writer fills. */
  readonly directory: string;
  /** The names the writer adds to `document-models/index.ts`. */
  readonly exportNames: readonly string[];
};

export type PlannedModelExport = {
  readonly name: string;
  readonly file: string;
};

export type PlannedDocumentModels = {
  readonly models: readonly PlannedDocumentModel[];
  readonly unreadableDirs: readonly string[];
};

/**
 * A second model source in a code-first package. Planning reads and never
 * writes, so the package can refuse a conflict before the source writes.
 */
export type ModelGenerationSource = {
  planDocumentModel(
    state: DocumentModelGlobalState,
    project: Project,
  ): PlannedDocumentModel;
  planAllDocumentModels(project: Project): PlannedDocumentModels;
  planExportNames(
    project: Project,
    models: readonly PlannedDocumentModel[],
  ): readonly PlannedModelExport[];
  generateDocumentModel(
    state: DocumentModelGlobalState,
    project: Project,
  ): Promise<void>;
  generateEditor(
    request: GenerateEditorRequest,
    project: Project,
  ): Promise<void>;
};
