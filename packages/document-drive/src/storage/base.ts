import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
} from "#drive-document-model/gen/types";
import { type SynchronizationUnitQuery } from "#server/types";
import type {
  DocumentHeader,
  Operation,
  OperationFromDocument,
  PHDocument,
} from "document-model";
import {
  type IDriveStorage,
  type IStorage,
  type IStorageDelegate,
} from "./types.js";

abstract class BaseStorage implements IStorage {
  abstract checkDocumentExists(drive: string, id: string): Promise<boolean>;

  abstract getDocuments(drive: string): Promise<string[]>;

  abstract getDocument<TDocument extends PHDocument>(
    drive: string,
    id: string,
  ): Promise<TDocument>;

  abstract createDocument(
    drive: string,
    id: string,
    document: PHDocument,
  ): Promise<void>;

  abstract addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void>;

  abstract addDocumentOperationsWithTransaction<TDocument extends PHDocument>(
    drive: string,
    id: string,
    callback: (document: TDocument) => Promise<{
      operations: OperationFromDocument<TDocument>[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;

  abstract deleteDocument(drive: string, id: string): Promise<void>;

  abstract getOperationResultingState<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<TGlobalState | TLocalState | undefined>;

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
  abstract getDrive(id: string): Promise<DocumentDriveDocument>;
  abstract getDriveBySlug(slug: string): Promise<DocumentDriveDocument>;
  abstract createDrive(id: string, drive: DocumentDriveDocument): Promise<void>;
  abstract deleteDrive(id: string): Promise<void>;
  abstract addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    header: DocumentHeader,
  ): Promise<void>;
}
