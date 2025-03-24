import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
} from "#drive-document-model/gen/types";
import { DriveNotFoundError } from "#server/error";
import { type SynchronizationUnitQuery } from "#server/types";
import { migrateDocumentOperationSignatures } from "#utils/migrations";
import { mergeOperations } from "#utils/misc";
import type {
  DocumentHeader,
  Operation,
  OperationScope,
  PHDocument,
} from "document-model";
import LocalForage from "localforage";
import { type IDocumentStorage, type IDriveStorage } from "./types.js";

// Interface for drive manifest that tracks document IDs in a drive
interface DriveManifest {
  documentIds: string[];
}

export class BrowserStorage implements IDriveStorage, IDocumentStorage {
  private db: Promise<LocalForage>;

  static DBName = "DOCUMENT_DRIVES";
  static SEP = ":";
  static DOCUMENT_KEY = "DOCUMENT";
  static MANIFEST_KEY = "MANIFEST";

  constructor(namespace?: string) {
    this.db = LocalForage.ready().then(() =>
      LocalForage.createInstance({
        name: namespace
          ? `${namespace}:${BrowserStorage.DBName}`
          : BrowserStorage.DBName,
      }),
    );
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  async exists(documentId: string): Promise<boolean> {
    const db = await this.db;
    const document = await db.getItem<Document>(
      this.buildDocumentKey(documentId),
    );

    return !!document;
  }

  async create(documentId: string, document: PHDocument): Promise<void> {
    const db = await this.db;
    await db.setItem(this.buildDocumentKey(documentId), document);
  }

  async get<TDocument extends PHDocument>(
    documentId: string,
  ): Promise<TDocument> {
    const db = await this.db;
    const document = await db.getItem<TDocument>(
      this.buildDocumentKey(documentId),
    );

    if (!document) {
      throw new Error(`Document with id ${documentId} not found`);
    }

    return document;
  }

  ////////////////////////////////
  // IDriveStorage
  ////////////////////////////////

  checkDocumentExists(drive: string, documentId: string): Promise<boolean> {
    return this.exists(documentId);
  }

  private async getDriveManifest(driveId: string): Promise<DriveManifest> {
    const db = await this.db;
    const manifest = await db.getItem<DriveManifest>(
      this.buildManifestKey(driveId),
    );
    return manifest || { documentIds: [] };
  }

  private async updateDriveManifest(
    driveId: string,
    manifest: DriveManifest,
  ): Promise<void> {
    const db = await this.db;
    await db.setItem(this.buildManifestKey(driveId), manifest);
  }

  async getDocuments(drive: string) {
    const manifest = await this.getDriveManifest(drive);
    return manifest.documentIds;
  }

  async getDocument<TDocument extends PHDocument>(
    driveId: string,
    id: string,
  ): Promise<TDocument> {
    return this.get<TDocument>(id);
  }

  async createDocument(drive: string, id: string, document: PHDocument) {
    await this.create(id, document);

    // Update the drive manifest to include this document
    const manifest = await this.getDriveManifest(drive);
    if (!manifest.documentIds.includes(id)) {
      manifest.documentIds.push(id);
      await this.updateDriveManifest(drive, manifest);
    }
  }

  async deleteDocument(drive: string, id: string) {
    await (await this.db).removeItem(this.buildDocumentKey(id));

    // Update the drive manifest to remove this document
    const manifest = await this.getDriveManifest(drive);
    const docIndex = manifest.documentIds.indexOf(id);
    if (docIndex !== -1) {
      manifest.documentIds.splice(docIndex, 1);
      await this.updateDriveManifest(drive, manifest);
    }
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
    await db.setItem(this.buildDocumentKey(id), {
      ...document,
      ...header,
      operations: mergedOperations,
    });
  }

  async getDrives() {
    const db = await this.db;
    const keys = await db.keys();
    return keys
      .filter((key) => key.startsWith(BrowserStorage.MANIFEST_KEY))
      .map((key) =>
        key.slice(
          BrowserStorage.MANIFEST_KEY.length + BrowserStorage.SEP.length,
        ),
      );
  }

  async getDrive(id: string) {
    let drive;
    try {
      drive = await this.get<DocumentDriveDocument>(id);
    } catch {
      // preserve throwing a specialized error for drives
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
    await this.create(id, drive);

    // Initialize an empty manifest for the new drive
    await this.updateDriveManifest(id, { documentIds: [] });
  }

  async deleteDrive(id: string) {
    // First get all documents in this drive
    const documents = await this.getDocuments(id);

    // Delete each document (this already updates the manifest)
    await Promise.all(documents.map((doc) => this.deleteDocument(id, doc)));

    // Delete the drive and its manifest
    const db = await this.db;
    await db.removeItem(this.buildManifestKey(id));
    return db.removeItem(this.buildDocumentKey(id));
  }

  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    header: DocumentHeader,
  ): Promise<void> {
    const drive = await this.getDrive(id);
    const mergedOperations = mergeOperations(drive.operations, operations);
    const db = await this.db;

    await db.setItem(this.buildDocumentKey(id), {
      ...drive,
      ...header,
      operations: mergedOperations,
    });
  }

  async getSynchronizationUnitsRevision(
    units: SynchronizationUnitQuery[],
  ): Promise<
    {
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
          const document = await this.get<PHDocument>(unit.documentId);
          if (!document) {
            return undefined;
          }
          const operation =
            document.operations[unit.scope as OperationScope].at(-1);
          if (operation) {
            return {
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
      await this.migrateDrive(drive);

      const documents = await this.getDocuments(drive);
      await Promise.all(
        documents.map(async (docId) => this.migrateDocument(drive, docId)),
      );
    }
  }

  private async migrateDrive(driveId: string) {
    const drive = await this.getDrive(driveId);
    const migratedDrive = migrateDocumentOperationSignatures(drive);
    if (migratedDrive !== drive) {
      return (await this.db).setItem(
        this.buildDocumentKey(driveId),
        migratedDrive,
      );
    }
  }

  private async migrateDocument(drive: string, id: string) {
    const document = await this.getDocument(drive, id);
    const migratedDocument = migrateDocumentOperationSignatures(document);
    if (migratedDocument !== document) {
      return (await this.db).setItem(
        this.buildDocumentKey(id),
        migratedDocument,
      );
    }
  }

  ////////////////////////////////
  // Private methods
  ////////////////////////////////

  buildDocumentKey(documentId: string) {
    return `${BrowserStorage.DOCUMENT_KEY}${BrowserStorage.SEP}${documentId}`;
  }

  buildManifestKey(driveId: string) {
    return `${BrowserStorage.MANIFEST_KEY}${BrowserStorage.SEP}${driveId}`;
  }
}
