import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "@drive-document-model";
import { DriveNotFoundError } from "@server/error";
import type { SynchronizationUnitQuery } from "@server/types";
import type {
  DocumentDriveStorage,
  DocumentStorage,
  IDriveStorage,
} from "@storage/types";
import { mergeOperations } from "@utils/misc";
import {
  BaseAction,
  BaseDocument,
  DocumentHeader,
  Operation,
  OperationScope,
} from "document-model";

export class MemoryStorage implements IDriveStorage {
  private documents: Record<
    string,
    Record<string, BaseDocument<any, any, BaseAction>>
  >;
  private drives: Record<string, DocumentDriveStorage>;
  private slugToDriveId: Record<string, string> = {};

  constructor() {
    this.documents = {};
    this.drives = {};
  }

  checkDocumentExists(drive: string, id: string): Promise<boolean> {
    return Promise.resolve(this.documents[drive][id] !== undefined);
  }

  async getDocuments(drive: string) {
    return Object.keys(this.documents[drive] ?? {});
  }

  async getDocument<TGlobalState, TLocalState, TAction extends BaseAction>(
    driveId: string,
    id: string,
  ): Promise<DocumentStorage<TGlobalState, TLocalState, TAction>> {
    const drive = this.documents[driveId];
    if (!drive) {
      throw new DriveNotFoundError(driveId);
    }
    const document = drive[id];
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    return document as DocumentStorage<TGlobalState, TLocalState, TAction>;
  }

  async saveDocument(
    drive: string,
    id: string,
    document: BaseDocument<any, any, BaseAction>,
  ) {
    this.documents[drive] = this.documents[drive] ?? {};
    this.documents[drive][id] = document;
  }

  async clearStorage(): Promise<void> {
    this.documents = {};
    this.drives = {};
  }

  async createDocument(
    drive: string,
    id: string,
    document: DocumentStorage<any, any, BaseAction>,
  ) {
    this.documents[drive] = this.documents[drive] ?? {};
    const {
      operations,
      initialState,
      name,
      revision,
      documentType,
      created,
      lastModified,
      clipboard,
      state,
    } = document;
    this.documents[drive][id] = {
      operations,
      initialState,
      name,
      revision,
      documentType,
      created,
      lastModified,
      clipboard,
      state,
    };
  }

  async addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation<any, any, BaseAction>[],
    header: DocumentHeader,
  ): Promise<void> {
    const document = await this.getDocument(drive, id);
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    const mergedOperations = mergeOperations(document.operations, operations);

    this.documents[drive][id] = {
      ...document,
      ...header,
      operations: mergedOperations,
    };
  }

  async deleteDocument(drive: string, id: string) {
    if (!this.documents[drive]) {
      throw new DriveNotFoundError(drive);
    }
    delete this.documents[drive][id];
  }

  async getDrives() {
    return Object.keys(this.drives);
  }

  async getDrive(id: string) {
    const drive = this.drives[id];
    if (!drive) {
      throw new DriveNotFoundError(id);
    }
    return drive;
  }

  async getDriveBySlug(slug: string) {
    const driveId = this.slugToDriveId[slug];
    if (!driveId) {
      throw new Error(`Drive with slug ${slug} not found`);
    }
    return this.getDrive(driveId);
  }

  async createDrive(id: string, drive: DocumentDriveStorage) {
    this.drives[id] = drive;
    this.documents[id] = {};
    const { slug } = drive.initialState.state.global;
    if (slug) {
      this.slugToDriveId[slug] = id;
    }
  }

  async addDriveOperations(
    id: string,
    operations: Operation<
      DocumentDriveState,
      DocumentDriveLocalState,
      DocumentDriveAction
    >[],
    header: DocumentHeader,
  ): Promise<void> {
    const drive = await this.getDrive(id);
    const mergedOperations = mergeOperations(drive.operations, operations);

    this.drives[id] = {
      ...drive,
      ...header,
      operations: mergedOperations,
    };
  }

  async deleteDrive(id: string) {
    delete this.documents[id];
    delete this.drives[id];
  }

  async getSynchronizationUnitsRevision(
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
  > {
    const results = await Promise.allSettled(
      units.map(async (unit) => {
        try {
          const document = await (unit.documentId
            ? this.getDocument(unit.driveId, unit.documentId)
            : this.getDrive(unit.driveId));
          if (!document) {
            return undefined;
          }
          const operation =
            document.operations[unit.scope as OperationScope].at(-1);
          if (operation) {
            return {
              driveId: unit.driveId,
              documentId: unit.documentId,
              scope: unit.scope,
              branch: unit.branch,
              lastUpdated: operation.timestamp,
              revision: operation.index,
            };
          }
        } catch {
          return undefined;
        }
      }),
    );
    return results.reduce<
      {
        driveId: string;
        documentId: string;
        scope: string;
        branch: string;
        lastUpdated: string;
        revision: number;
      }[]
    >((acc, curr) => {
      if (curr.status === "fulfilled" && curr.value !== undefined) {
        acc.push(curr.value);
      }
      return acc;
    }, []);
  }
}
