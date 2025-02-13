import type {
  DocumentDriveLocalState,
  DocumentDriveState,
} from "@drive-document-model";
import type { SynchronizationUnitQuery } from "@server/types";
import type {
  BaseDocument,
  DocumentHeader,
  DocumentOperations,
  Operation,
} from "document-model";

export type DocumentStorage<TGlobalState, TLocalState> = Omit<
  BaseDocument<TGlobalState, TLocalState>,
  "attachments"
>;

export type DocumentDriveStorage = DocumentStorage<
  DocumentDriveState,
  DocumentDriveLocalState
>;

export interface IStorageDelegate {
  getCachedOperations<TGlobalState, TLocalState>(
    drive: string,
    id: string,
  ): Promise<DocumentOperations<TGlobalState, TLocalState> | undefined>;
}

export interface IStorage {
  checkDocumentExists(drive: string, id: string): Promise<boolean>;
  getDocuments: (drive: string) => Promise<string[]>;
  getDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
  ): Promise<DocumentStorage<TGlobalState, TLocalState>>;
  createDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    document: DocumentStorage<TGlobalState, TLocalState>,
  ): Promise<void>;
  addDocumentOperations<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState>[],
    header: DocumentHeader,
  ): Promise<void>;
  addDocumentOperationsWithTransaction?<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    callback: (
      document: DocumentStorage<TGlobalState, TLocalState>,
    ) => Promise<{
      operations: Operation<TGlobalState, TLocalState>[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;
  deleteDocument(drive: string, id: string): Promise<void>;
  getOperationResultingState?(
    drive: string,
    id: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<unknown>;
  setStorageDelegate?(delegate: IStorageDelegate): void;
  getSynchronizationUnitsRevision(units: SynchronizationUnitQuery[]): Promise<
    {
      driveId: string;
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
  getDrive(id: string): Promise<DocumentDriveStorage>;
  getDriveBySlug(slug: string): Promise<DocumentDriveStorage>;
  createDrive(id: string, drive: DocumentDriveStorage): Promise<void>;
  deleteDrive(id: string): Promise<void>;
  clearStorage?(): Promise<void>;
  addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveState, DocumentDriveLocalState>[],
    header: DocumentHeader,
  ): Promise<void>;
  addDriveOperationsWithTransaction?(
    drive: string,
    callback: (document: DocumentDriveStorage) => Promise<{
      operations: Operation<DocumentDriveState, DocumentDriveLocalState>[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;
  getDriveOperationResultingState?(
    drive: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<unknown>;
}
