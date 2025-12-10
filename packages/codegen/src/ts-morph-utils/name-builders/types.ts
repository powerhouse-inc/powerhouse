import type {
  ModuleSpecification,
  OperationErrorSpecification,
} from "document-model";
import type { DocumentModelFileMakerArgs } from "../file-builders/document-model/types.js";
import type {
  getDocumentModelOperationsModuleVariableNames,
  getDocumentModelVariableNames,
} from "./get-variable-names.js";

export type DocumentModelVariableNames = ReturnType<
  typeof getDocumentModelVariableNames
>;

export type DocumentModelOperationsModuleVariableNames = ReturnType<
  typeof getDocumentModelOperationsModuleVariableNames
>;

export type DocumentModelTemplateInputs = DocumentModelFileMakerArgs &
  DocumentModelVariableNames;

export type DocumentModelTemplateInputsWithModule = {
  module: ModuleSpecification;
} & DocumentModelTemplateInputs &
  DocumentModelOperationsModuleVariableNames;

export type ActionFromOperation = {
  name: string;
  hasInput: boolean;
  hasAttachment: boolean;
  scope: string;
  state: string;
  errors: OperationErrorSpecification[];
};
