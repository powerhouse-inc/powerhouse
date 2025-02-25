import {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "#drive-document-model/gen/types";
import { DriveNotFoundError } from "#server/error";
import { SynchronizationUnitQuery } from "#server/types";
import { migrateDocumentOperationSignatures } from "#utils/migrations";
import { mergeOperations } from "#utils/misc";
import type {
  Action,
  DocumentHeader,
  Operation,
  OperationScope,
  PHDocument,
} from "document-model";
import LocalForage from "localforage";
import { IDriveStorage } from "./types.js";

export class BrowserStorage implements IDriveStorage {
  private db: Promise<LocalForage>;

  static DBName = "DOCUMENT_DRIVES";
  static SEP = ":";
  static DRIVES_KEY = "DRIVES";

  constructor(namespace?: string) {
    this.db = LocalForage.ready().then(() =>
      LocalForage.createInstance({
        name: namespace
          ? `${namespace}:${BrowserStorage.DBName}`
          : BrowserStorage.DBName,
      }),
    );
  }

  buildKey(...args: string[]) {
    return args.join(BrowserStorage.SEP);
  }

  async checkDocumentExists(drive: string, id: string): Promise<boolean> {
    const document = await (
      await this.db
    ).getItem<Document>(this.buildKey(drive, id));
    return !!document;
  }

  async getDocuments(drive: string) {
    const db = await this.db;
    const keys = await db.keys();
    const driveKey = `${drive}${BrowserStorage.SEP}`;
    return keys
      .filter((key) => key.startsWith(driveKey))
      .map((key) => key.slice(driveKey.length));
  }

  async getDocument<TGlobalState, TLocalState, TAction extends Action = Action>(
    driveId: string,
    id: string,
  ): Promise<PHDocument<TGlobalState, TLocalState, TAction>> {
    const document = await (
      await this.db
    ).getItem<PHDocument<TGlobalState, TLocalState, TAction>>(
      this.buildKey(driveId, id),
    );
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }
    return document;
  }

  async createDocument<
    TGlobalState,
    TLocalState,
    TAction extends Action = Action,
  >(
    drive: string,
    id: string,
    document: PHDocument<TGlobalState, TLocalState, TAction>,
  ) {
    await (await this.db).setItem(this.buildKey(drive, id), document);
  }

  async deleteDocument(drive: string, id: string) {
    await (await this.db).removeItem(this.buildKey(drive, id));
  }

  async clearStorage(): Promise<void> {
    return (await this.db).clear();
  }

  async addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void> {
    const document = await this.getDocument(drive, id);
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    const mergedOperations = mergeOperations(document.operations, operations);

    const db = await this.db;
    await db.setItem(this.buildKey(drive, id), {
      ...document,
      ...header,
      operations: mergedOperations,
    });
  }

  async getDrives() {
    const db = await this.db;
    const keys = await db.keys();
    return keys
      .filter((key) => key.startsWith(BrowserStorage.DRIVES_KEY))
      .map((key) =>
        key.slice(BrowserStorage.DRIVES_KEY.length + BrowserStorage.SEP.length),
      );
  }

  async getDrive(id: string) {
    const db = await this.db;
    const drive = await db.getItem<DocumentDriveDocument>(
      this.buildKey(BrowserStorage.DRIVES_KEY, id),
    );
    if (!drive) {
      throw new DriveNotFoundError(id);
    }
    return drive;
  }

  async getDriveBySlug(slug: string) {
    // get oldes drives first
    const drives = (await this.getDrives()).reverse();
    for (const drive of drives) {
      const driveData = await this.getDrive(drive);
      if (driveData.initialState.state.global.slug === slug) {
        return this.getDrive(drive);
      }
    }

    throw new Error(`Drive with slug ${slug} not found`);
  }

  async createDrive(id: string, drive: DocumentDriveDocument) {
    const db = await this.db;
    await db.setItem(this.buildKey(BrowserStorage.DRIVES_KEY, id), drive);
  }

  async deleteDrive(id: string) {
    const documents = await this.getDocuments(id);
    await Promise.all(documents.map((doc) => this.deleteDocument(id, doc)));
    return (await this.db).removeItem(
      this.buildKey(BrowserStorage.DRIVES_KEY, id),
    );
  }

  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    header: DocumentHeader,
  ): Promise<void> {
    const drive = await this.getDrive(id);
    const mergedOperations = mergeOperations(drive.operations, operations);
    const db = await this.db;

    await db.setItem(this.buildKey(BrowserStorage.DRIVES_KEY, id), {
      ...drive,
      ...header,
      operations: mergedOperations,
    });
    return;
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

  // migrates all stored operations from legacy signature to signatures array
  async migrateOperationSignatures() {
    const drives = await this.getDrives();
    for (const drive of drives) {
      await this.migrateDocument(BrowserStorage.DRIVES_KEY, drive);

      const documents = await this.getDocuments(drive);
      await Promise.all(
        documents.map(async (docId) => this.migrateDocument(drive, docId)),
      );
    }
  }

  private async migrateDocument(drive: string, id: string) {
    const document = await this.getDocument(drive, id);
    const migratedDocument = migrateDocumentOperationSignatures(document);
    if (migratedDocument !== document) {
      return (await this.db).setItem(
        this.buildKey(drive, id),
        migratedDocument,
      );
    }
  }
}
