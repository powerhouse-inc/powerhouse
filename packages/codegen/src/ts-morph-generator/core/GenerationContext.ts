import {
  type DocumentModelState,
  type Operation as ModuleOperation,
} from "document-model/document-model/gen/schema/types";
import { type Project } from "ts-morph";

// Use the actual module type from document model specs
export type ModuleSpec = DocumentModelState["specifications"][0]["modules"][0];

export type Operation = ModuleOperation & {
  hasInput: boolean;
  hasAttachment: boolean | undefined;
  scope: string;
  state: string;
  errors?: unknown;
};

export interface GenerationContext {
  rootDir: string;
  docModel: DocumentModelState;
  module: ModuleSpec;
  project: Project;
  operations: Operation[];
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
