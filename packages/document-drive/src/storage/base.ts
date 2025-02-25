import {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "#drive-document-model/gen/types";
import { SynchronizationUnitQuery } from "#server/types";
import type {
  Action,
  DocumentHeader,
  Operation,
  PHDocument,
} from "document-model";
import { IDriveStorage, IStorage, IStorageDelegate } from "./types.js";

abstract class BaseStorage implements IStorage {
  abstract checkDocumentExists(drive: string, id: string): Promise<boolean>;

  abstract getDocuments(drive: string): Promise<string[]>;

  abstract getDocument<
    TGlobalState,
    TLocalState,
    TAction extends Action = Action,
  >(
    drive: string,
    id: string,
  ): Promise<PHDocument<TGlobalState, TLocalState, TAction>>;

  abstract createDocument<
    TGlobalState,
    TLocalState,
    TAction extends Action = Action,
  >(
    drive: string,
    id: string,
    document: PHDocument<TGlobalState, TLocalState, TAction>,
  ): Promise<void>;

  abstract addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void>;

  abstract addDocumentOperationsWithTransaction<
    TGlobalState,
    TLocalState,
    TAction extends Action = Action,
  >(
    drive: string,
    id: string,
    callback: (
      document: PHDocument<TGlobalState, TLocalState, TAction>,
    ) => Promise<{
      operations: Operation[];
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
