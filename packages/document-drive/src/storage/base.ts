import { DocumentDriveAction } from "document-model-libs/document-drive";
import { BaseAction, DocumentHeader, Operation } from "document-model/document";
import { SynchronizationUnitQuery } from "../server";
import {
  DocumentDriveStorage,
  DocumentStorage,
  IDriveStorage,
  IStorage,
  IStorageDelegate,
} from "./types";

abstract class BaseStorage implements IStorage {
  abstract checkDocumentExists(drive: string, id: string): Promise<boolean>;

  abstract getDocuments(drive: string): Promise<string[]>;

  abstract getDocument(drive: string, id: string): Promise<DocumentStorage>;

  abstract createDocument(
    drive: string,
    id: string,
    document: DocumentStorage,
  ): Promise<void>;

  abstract addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void>;

  abstract addDocumentOperationsWithTransaction?(
    drive: string,
    id: string,
    callback: (document: DocumentStorage) => Promise<{
      operations: Operation[];
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
    operations: Operation<DocumentDriveAction | BaseAction>[],
    header: DocumentHeader,
  ): Promise<void>;
}
