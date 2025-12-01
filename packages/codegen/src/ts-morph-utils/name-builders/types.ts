import type { OperationErrorSpecification } from "document-model";
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

export type AllDocumentModelVariableNames = DocumentModelVariableNames &
  DocumentModelOperationsModuleVariableNames;

export type ActionFromOperation = {
  name: string;
  hasInput: boolean;
  hasAttachment: boolean;
  scope: string;
  state: string;
  errors: OperationErrorSpecification[];
};
