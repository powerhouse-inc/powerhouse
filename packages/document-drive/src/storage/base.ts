import {
  DocumentDriveLocalState,
  DocumentDriveState,
} from "@drive-document-model";
import type { SynchronizationUnitQuery } from "@server/types";
import type {
  DocumentDriveStorage,
  DocumentStorage,
  IDriveStorage,
  IStorage,
  IStorageDelegate,
} from "@storage/types";
import type { DocumentHeader, Operation } from "document-model";

abstract class BaseStorage implements IStorage {
  abstract checkDocumentExists(drive: string, id: string): Promise<boolean>;

  abstract getDocuments(drive: string): Promise<string[]>;

  abstract getDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
  ): Promise<DocumentStorage<TGlobalState, TLocalState>>;

  abstract createDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    document: DocumentStorage<TGlobalState, TLocalState>,
  ): Promise<void>;

  abstract addDocumentOperations<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState>[],
    header: DocumentHeader,
  ): Promise<void>;

  abstract addDocumentOperationsWithTransaction<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    callback: (
      document: DocumentStorage<TGlobalState, TLocalState>,
    ) => Promise<{
      operations: Operation<TGlobalState, TLocalState>[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;

  abstract deleteDocument(drive: string, id: string): Promise<void>;

  abstract getOperationResultingState?(
    drive: string,
    id: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<unknown>;

  abstract setStorageDelegate?(delegate: IStorageDelegate): void;

  abstract getSynchronizationUnitsRevision(
    units: SynchronizationUnitQuery[],
  ): Promise<
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

export abstract class BaseDriveStorage
  extends BaseStorage
  implements IDriveStorage
{
  abstract getDrives(): Promise<string[]>;
  abstract getDrive(id: string): Promise<DocumentDriveStorage>;
  abstract getDriveBySlug(slug: string): Promise<DocumentDriveStorage>;
  abstract createDrive(id: string, drive: DocumentDriveStorage): Promise<void>;
  abstract deleteDrive(id: string): Promise<void>;
  abstract addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveState, DocumentDriveLocalState>[],
    header: DocumentHeader,
  ): Promise<void>;
}
