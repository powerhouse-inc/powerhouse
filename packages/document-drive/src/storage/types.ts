import type {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "@drive-document-model";
import type { SynchronizationUnitQuery } from "@server/types";
import type {
  BaseAction,
  BaseDocument,
  DocumentHeader,
  DocumentOperations,
  Operation,
} from "document-model";

export type DocumentStorage<
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
> = Omit<BaseDocument<TGlobalState, TLocalState, TAction>, "attachments">;

export type DocumentDriveStorage = DocumentStorage<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
>;

export interface IStorageDelegate {
  getCachedOperations<TGlobalState, TLocalState, TAction extends BaseAction>(
    drive: string,
    id: string,
  ): Promise<
    DocumentOperations<TGlobalState, TLocalState, TAction> | undefined
  >;
}

export interface IStorage {
  checkDocumentExists(drive: string, id: string): Promise<boolean>;
  getDocuments: (drive: string) => Promise<string[]>;
  getDocument<TGlobalState, TLocalState, TAction extends BaseAction>(
    drive: string,
    id: string,
  ): Promise<DocumentStorage<TGlobalState, TLocalState, TAction>>;
  createDocument<TGlobalState, TLocalState, TAction extends BaseAction>(
    drive: string,
    id: string,
    document: DocumentStorage<TGlobalState, TLocalState, TAction>,
  ): Promise<void>;
  addDocumentOperations<TGlobalState, TLocalState, TAction extends BaseAction>(
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState, TAction>[],
    header: DocumentHeader,
  ): Promise<void>;
  addDocumentOperationsWithTransaction?<
    TGlobalState,
    TLocalState,
    TAction extends BaseAction,
  >(
    drive: string,
    id: string,
    callback: (
      document: DocumentStorage<TGlobalState, TLocalState, TAction>,
    ) => Promise<{
      operations: Operation<TGlobalState, TLocalState, TAction>[];
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
    operations: Operation<
      DocumentDriveState,
      DocumentDriveLocalState,
      DocumentDriveAction | BaseAction
    >[],
    header: DocumentHeader,
  ): Promise<void>;
  addDriveOperationsWithTransaction?<
    TGlobalState,
    TLocalState,
    TAction extends BaseAction,
  >(
    drive: string,
    callback: (document: DocumentDriveStorage) => Promise<{
      operations: Operation<TGlobalState, TLocalState, TAction>[];
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
