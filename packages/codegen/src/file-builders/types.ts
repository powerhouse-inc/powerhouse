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
  project: Project;
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

export type PieceAuthKind = "none" | "secret" | "custom";

export type PieceTriggerStrategy = "polling" | "webhook";

// The name bundle every piece template takes, computed once by the file
// builder so no two templates spell the same piece differently.
export type PieceNames = {
  /** Directory under pieces/, e.g. "acme-crm". */
  kebabCaseName: string;
  /** The exported const, e.g. "acmeCrm". */
  camelCaseName: string;
  /** Type and class prefix, e.g. "AcmeCrm". */
  pascalCaseName: string;
  /** SCREAMING_SNAKE, e.g. "ACME_CRM". */
  constantCaseName: string;
  /** Human name, e.g. "Acme Crm". */
  displayName: string;
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
