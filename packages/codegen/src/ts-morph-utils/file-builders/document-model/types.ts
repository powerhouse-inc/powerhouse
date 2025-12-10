import type {
  DocumentModelGlobalState,
  ModuleSpecification,
} from "document-model";
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
