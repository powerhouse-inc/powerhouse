import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { type SynchronizationUnitQuery } from "#server/types";
import type {
  DocumentHeader,
  Operation,
  OperationFromDocument,
  PHDocument,
} from "document-model";

export interface IDocumentStorage {
  exists(documentId: string): Promise<boolean>;
  create(documentId: string, document: PHDocument): Promise<void>;
  get<TDocument extends PHDocument>(documentId: string): Promise<TDocument>;
  delete(documentId: string): Promise<boolean>;

  addChild(parentId: string, childId: string): Promise<void>;
  removeChild(parentId: string, childId: string): Promise<boolean>;
  getChildren(parentId: string): Promise<string[]>;
  //getParent(childId: string): Promise<string | undefined>;
}

export interface IStorage {
  getDocuments: (drive: string) => Promise<string[]>;
  addDocumentOperations<TDocument extends PHDocument>(
    drive: string,
    id: string,
    operations: OperationFromDocument<TDocument>[],
    header: DocumentHeader,
  ): Promise<void>;
  addDocumentOperationsWithTransaction?<TDocument extends PHDocument>(
    drive: string,
    id: string,
    callback: (document: TDocument) => Promise<{
      operations: OperationFromDocument<TDocument>[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;
  getOperationResultingState?(
    drive: string,
    id: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<string | undefined>;
  getSynchronizationUnitsRevision(units: SynchronizationUnitQuery[]): Promise<
    {
      documentId: string;
      scope: string;
      branch: string;
      lastUpdated: string;
      revision: number;
    }[]
  >;
}

export interface IDriveStorage extends IStorage {
  getDrives(): Promise<string[]>;
  getDriveBySlug(slug: string): Promise<DocumentDriveDocument>;
  createDrive(id: string, drive: DocumentDriveDocument): Promise<void>;
  deleteDrive(id: string): Promise<void>;
  clearStorage?(): Promise<void>;
  addDriveOperations(
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void>;
  addDriveOperationsWithTransaction?(
    drive: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;
  getDriveOperationResultingState?(
    drive: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<string | undefined>;
}
