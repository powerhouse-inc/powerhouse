import {
  type DocumentModelState,
  type Module,
  type OperationError,
} from "document-model";
import { type Project } from "ts-morph";

export type CodegenOperation = {
  id: string;
  name: string | null;
  description: string | null;
  examples: any[];
  reducer: any;
  schema: string | null;
  template: string | null;
  hasInput: boolean;
  hasAttachment: boolean | undefined;
  scope: string;
  state: string;
  errors?: OperationError[];
};

export interface GenerationContext {
  rootDir: string;
  docModel: DocumentModelState;
  module: Module;
  project: Project;
  operations: CodegenOperation[];
  forceUpdate: boolean;
}

export type PHProjectDirectories = {
  documentModelDir?: string;
  editorsDir?: string;
  processorsDir?: string;
  subgraphsDir?: string;
};

export type CodeGeneratorOptions = {
  directories?: PHProjectDirectories;
  forceUpdate?: boolean;
};
