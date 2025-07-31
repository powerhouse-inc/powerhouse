import { type DocumentModelState, type OperationScope } from "document-model";
import { type Project } from "ts-morph";

export type Actions = {
  name: string | null;
  hasInput: boolean;
  hasAttachment: boolean | undefined;
  scope: OperationScope;
  state: string;
  errors?: unknown;
};

// Use the actual module type from document model specs
export type ModuleSpec = DocumentModelState["specifications"][0]["modules"][0];

export interface GenerationContext {
  rootDir: string;
  docModel: DocumentModelState;
  module: ModuleSpec;
  project: Project;
  actions: Actions[];
}

export type PHProjectDirectories = {
  documentModelDir?: string;
  editorsDir?: string;
  processorsDir?: string;
  subgraphsDir?: string;
};

export type CodeGeneratorOptions = {
  directories?: PHProjectDirectories;
};
