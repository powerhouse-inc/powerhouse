import { DocumentDriveDocument } from "#drive-document-model/gen/types";
import { SynchronizationUnitQuery } from "#server/types";
import type {
  Action,
  DocumentHeader,
  DocumentOperations,
  Operation,
  PHDocument,
} from "document-model";

export interface IStorageDelegate {
  getCachedOperations<TAction extends Action = Action>(
    drive: string,
    id: string,
  ): Promise<DocumentOperations<TAction> | undefined>;
}

export interface IStorage {
  checkDocumentExists(drive: string, id: string): Promise<boolean>;
  getDocuments: (drive: string) => Promise<string[]>;
  getDocument<TGlobalState, TLocalState, TAction extends Action = Action>(
    drive: string,
    id: string,
  ): Promise<PHDocument<TGlobalState, TLocalState, TAction>>;
  createDocument<TGlobalState, TLocalState, TAction extends Action = Action>(
    drive: string,
    id: string,
    document: PHDocument<TGlobalState, TLocalState, TAction>,
  ): Promise<void>;
  addDocumentOperations<TAction extends Action = Action>(
    drive: string,
    id: string,
    operations: Operation<TAction>[],
    header: DocumentHeader,
  ): Promise<void>;
  addDocumentOperationsWithTransaction?<
    TGlobalState,
    TLocalState,
    TAction extends Action = Action,
  >(
    drive: string,
    id: string,
    callback: (
      document: PHDocument<TGlobalState, TLocalState, TAction>,
    ) => Promise<{
      operations: Operation<TAction>[];
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
  ): Promise<string | undefined>;
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
