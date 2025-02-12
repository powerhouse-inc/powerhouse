import type { SynchronizationUnitQuery } from "@server/base";
import type { BaseAction, DocumentHeader, Operation } from "document-model";
import type { DocumentModelState } from "document-model/document-model";
import type {
  DocumentDriveStorage,
  DocumentStorage,
  IDriveStorage,
  IStorage,
  IStorageDelegate,
} from "@storage/types";

abstract class BaseStorage implements IStorage {
  abstract checkDocumentExists(drive: string, id: string): Promise<boolean>;

  abstract getDocuments(drive: string): Promise<string[]>;

  abstract getDocument<TGlobalState, TLocalState, TAction extends BaseAction>(
    drive: string,
    id: string,
  ): Promise<DocumentStorage<TGlobalState, TLocalState, TAction>>;

  abstract createDocument<
    TGlobalState,
    TLocalState,
    TAction extends BaseAction,
  >(
    drive: string,
    id: string,
    document: DocumentStorage<TGlobalState, TLocalState, TAction>,
  ): Promise<void>;

  abstract addDocumentOperations<
    TGlobalState,
    TLocalState,
    TAction extends BaseAction,
  >(
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState, TAction>[],
    header: DocumentHeader,
  ): Promise<void>;

  abstract addDocumentOperationsWithTransaction<
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
  abstract addDriveOperations<
    TGlobalState extends DocumentModelState,
    TLocalState,
    TAction extends BaseAction,
  >(
    id: string,
    operations: Operation<TGlobalState, TLocalState, TAction>[],
    header: DocumentHeader,
  ): Promise<void>;
}
