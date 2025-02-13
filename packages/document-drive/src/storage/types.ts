import type {
  BaseDocument,
  DocumentHeader,
  DocumentOperations,
  Operation,
} from "document-model";
import {
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "../drive-document-model/gen/types.js";
import { SynchronizationUnitQuery } from "../server/types.js";

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
  ): Promise<BaseDocument<TGlobalState, TLocalState>>;
  createDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    document: BaseDocument<TGlobalState, TLocalState>,
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
    callback: (document: BaseDocument<TGlobalState, TLocalState>) => Promise<{
      operations: Operation<TGlobalState, TLocalState>[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;
  deleteDocument(drive: string, id: string): Promise<void>;
  getOperationResultingState?<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<TGlobalState | TLocalState | undefined>;
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
  getDrive(id: string): Promise<DocumentDriveDocument>;
  getDriveBySlug(slug: string): Promise<DocumentDriveDocument>;
  createDrive(id: string, drive: DocumentDriveDocument): Promise<void>;
  deleteDrive(id: string): Promise<void>;
  clearStorage?(): Promise<void>;
  addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveState, DocumentDriveLocalState>[],
    header: DocumentHeader,
  ): Promise<void>;
  addDriveOperationsWithTransaction?(
    drive: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation<DocumentDriveState, DocumentDriveLocalState>[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;
  getDriveOperationResultingState?<TGlobalState, TLocalState>(
    drive: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<TGlobalState | TLocalState | undefined>;
}
