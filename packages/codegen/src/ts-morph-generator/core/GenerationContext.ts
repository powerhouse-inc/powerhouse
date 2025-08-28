import type {
  DocumentModelState,
  ModuleSpecification,
  OperationErrorSpecification,
} from "document-model";
import type { Project } from "ts-morph";

export type CodegenOperation = {
  id: string;
  name: string | null;
  description: string | null;
  examples: {
    id: string;
    value: string;
  }[];
  reducer: string | null;
  schema: string | null;
  template: string | null;
  hasInput: boolean;
  hasAttachment: boolean | undefined;
  scope: string;
  state: string;
  errors?: OperationErrorSpecification[];
};

export interface GenerationContext {
  rootDir: string;
  docModel: DocumentModelState;
  module: ModuleSpecification;
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
