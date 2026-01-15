import type {
  getDocumentModelOperationsModuleVariableNames,
  getDocumentModelVariableNames,
  getEditorVariableNames,
} from "@powerhousedao/codegen/name-builders";
import type {
  DocumentModelGlobalState,
  ModuleSpecification,
  OperationErrorSpecification,
} from "document-model";
import type { Project } from "ts-morph";

export type CommonMakeEditorComponentArgs = {
  project: Project;
  editorDirPath: string;
  editorComponentsDirPath: string;
};

export type CommonGenerateEditorArgs = {
  packageName: string;
  projectDir: string;
  editorDir: string;
  editorName: string;
  editorId: string;
};

export type DocumentModelDocumentTypeMetadata = {
  documentModelId: string;
  documentModelDocumentTypeName: string;
  documentModelDirName: string;
  documentModelImportPath: string;
};

export type EditorVariableNames = ReturnType<typeof getEditorVariableNames>;

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
  isEmptyInput: boolean;
  hasAttachment: boolean;
  scope: string;
  state: string;
  errors: OperationErrorSpecification[];
};

export type GenerateDocumentModelArgs = {
  projectDir: string;
  packageName: string;
  documentModelState: DocumentModelGlobalState;
  useVersioning: boolean;
};

export type DocumentModelFileMakerArgs = DocumentModelVariableNames &
  GenerateDocumentModelArgs & {
    project: Project;
    version: number;
    documentTypeId: string;
    modules: ModuleSpecification[];
    initialGlobalState: string;
    initialLocalState: string;
    hasLocalSchema: boolean;
    documentModelsDirPath: string;
    documentModelDirName: string;
    documentModelDirPath: string;
    documentModelVersionDirName: string;
    documentModelVersionDirPath: string;
    documentModelPackageImportPath: string;
    versionedDocumentModelPackageImportPath: string;
    srcDirPath: string;
    genDirPath: string;
    testsDirPath: string;
    schemaDirPath: string;
    reducersDirPath: string;
    fileExtension: string;
  };
