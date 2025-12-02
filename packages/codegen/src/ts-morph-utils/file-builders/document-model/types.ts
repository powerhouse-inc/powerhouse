import type { DocumentModelGlobalState } from "document-model";
import type { Project } from "ts-morph";
import type { DocumentModelVariableNames } from "../../name-builders/types.js";

export type GenerateDocumentModelArgs = {
  projectDir: string;
  packageName: string;
  documentModelState: DocumentModelGlobalState;
};

export type DocumentModelFileMakerArgs = DocumentModelVariableNames &
  GenerateDocumentModelArgs & {
    project: Project;
  };
