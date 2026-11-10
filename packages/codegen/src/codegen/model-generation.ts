import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { Project } from "ts-morph";
import type {
  CodeFirstGenerationResult,
  GenerateCodeFirstDocumentModelArgs,
} from "../file-builders/document-model/code-first-model.js";

/** @experimental */
export type GenerateEditorRequest = {
  readonly editorName: string;

  readonly documentTypes: string[];
  readonly editorId?: string;
  readonly editorDirName?: string;
};

/** @experimental */
export type GeneratedDocumentModels = {
  readonly documentModels: DocumentModelGlobalState[];

  readonly unreadableDirs: string[];
  readonly codeFirstDocumentModels: readonly {
    readonly id: string;
    readonly name: string;
  }[];
};

/** @experimental */
export type GeneratedEditors = {
  readonly editors: {
    name: string;
    id: string;
    dirName: string;
    documentTypes: string[];
  }[];
  readonly unreadableDirs: string[];
};

/**
 * @experimental Document-model and editor generation for a package's
 * discovered models, schema-first and code-first alike. Every method reads
 * the whole inventory before it writes, and finishes through the one barrel
 * and manifest writer. The caller saves the project afterwards.
 */
export type ModelGeneration = {
  generateDocumentModel(
    state: DocumentModelGlobalState,
    project: Project,
  ): Promise<void>;
  generateAllDocumentModels(project: Project): Promise<GeneratedDocumentModels>;
  generateEditor(
    request: GenerateEditorRequest,
    project: Project,
  ): Promise<void>;
  generateAllEditors(project: Project): Promise<GeneratedEditors>;
  generateAll(project: Project): Promise<void>;
  /** Writes a new code-first model, the one choice `--code-first` makes. */
  scaffoldDocumentModel(
    args: GenerateCodeFirstDocumentModelArgs,
    project: Project,
  ): Promise<CodeFirstGenerationResult>;
};
