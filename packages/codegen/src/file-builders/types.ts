import type {
  DocumentModelGlobalState,
  DocumentSpecification,
  ModuleSpecification,
} from "@powerhousedao/shared/document-model";
import type {
  getDocumentModelVariableNames,
  getEditorVariableNames,
} from "name-builders";
import type { Project } from "ts-morph";

export type CommonMakeEditorComponentArgs = {
  project: Project;
  editorDirPath: string;
  editorComponentsDirPath: string;
};

export type CommonGenerateEditorArgs = {
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

export type GenerateDocumentModelArgs = {
  projectDir: string;
  documentModelState: DocumentModelGlobalState;
};

export type DocumentModelFileMakerArgs = DocumentModelVariableNames & {
  project: Project;
  documentModelState: DocumentModelGlobalState;
  version: number;
  latestVersion: number;
  versions: number[];
  specification: DocumentSpecification;
  initialGlobalState: string;
  initialLocalState: string;
  hasLocalSchema: boolean;
  projectDir: string;
  documentModelsDirPath: string;
  documentModelDirName: string;
  documentModelDirPath: string;
  documentModelImportPath: string;
  versionDirName: string;
  versionDirPath: string;
  versionImportPath: string;
  genDirPath: string;
  schemaDirPath: string;
  srcDirPath: string;
  testsDirPath: string;
  upgradesDirPath: string;
};

export type DocumentModelModuleFileMakerArgs = DocumentModelFileMakerArgs & {
  module: ModuleSpecification;
};

export type CommandEntry = {
  name: string;
  command: {
    description?: string;
    helpTopics?: () => HelpTopic[];
  };
};

export type HelpTopic = {
  category: string;
  usage: string;
  description: string;
  defaults: string[];
};

export type CommandHelpInfo = {
  name: string;
  description: string;
  helpTopics: HelpTopic[];
};
