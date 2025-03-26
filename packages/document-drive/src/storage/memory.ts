import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { DriveNotFoundError } from "#server/error";
import { type SynchronizationUnitQuery } from "#server/types";
import { mergeOperations } from "#utils/misc";
import {
  type DocumentHeader,
  type Operation,
  type OperationFromDocument,
  type OperationScope,
  type PHDocument,
} from "document-model";
import { type IDocumentStorage, type IDriveStorage } from "./types.js";

type DriveManifest = {
  documentIds: Set<string>;
};

export class MemoryStorage implements IDriveStorage, IDocumentStorage {
  private documents: Record<string, PHDocument>;
  private driveManifests: Record<string, DriveManifest>;

  constructor() {
    this.documents = {};
    this.driveManifests = {};
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  exists(documentId: string): Promise<boolean> {
    return Promise.resolve(
      !!this.documents[documentId] || !!this.documents[`drive/${documentId}`],
    );
  }

  create(documentId: string, document: PHDocument) {
    this.documents[documentId] = document;

    return Promise.resolve();
  }

  get<TDocument extends PHDocument>(documentId: string): Promise<TDocument> {
    const document = this.documents[documentId];
    if (!document) {
      const drive = this.documents[`drive/${documentId}`];
      if (drive) {
        return Promise.resolve(drive as TDocument);
      }

      throw new Error(`Document with id ${documentId} not found`);
    }

    return Promise.resolve(document as TDocument);
  }

  async delete(documentId: string): Promise<boolean> {
    // delete the document from all drive manifests
    const drives = await this.getDrives();
    for (const driveId of drives) {
      const manifest = this.getDriveManifest(driveId);
      if (manifest.documentIds.has(documentId)) {
        manifest.documentIds.delete(documentId);
        this.updateDriveManifest(driveId, manifest);
      }
    }

    if (this.documents[documentId]) {
      delete this.documents[documentId];

      return Promise.resolve(true);
    }

    return Promise.resolve(false);
  }

  ////////////////////////////////
  // IDriveStorage
  ////////////////////////////////

  checkDocumentExists(drive: string, id: string): Promise<boolean> {
    return this.exists(id);
  }

  getDocuments(drive: string) {
    const manifest = this.getDriveManifest(drive);
    return Promise.resolve([...manifest.documentIds]);
  }

  getDocument<TDocument extends PHDocument>(
    driveId: string,
    id: string,
  ): Promise<TDocument> {
    return this.get<TDocument>(id);
  }

  async clearStorage(): Promise<void> {
    this.documents = {};
    this.driveManifests = {};
  }

  async createDocument(drive: string, id: string, document: PHDocument) {
    await this.create(id, document);

    // Update the drive manifest
    const manifest = this.getDriveManifest(drive);
    manifest.documentIds.add(id);
    this.updateDriveManifest(drive, manifest);
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

    this.documents[id] = {
      ...document,
      ...header,
      operations: mergedOperations,
    };
  }

  async deleteDocument(drive: string, id: string) {
    this.delete(id);
  }

  async getDrives() {
    return Object.keys(this.driveManifests);
  }

  async getDrive(id: string) {
    const drive = this.documents[`drive/${id}`] as DocumentDriveDocument;
    if (!drive) {
      throw new DriveNotFoundError(id);
    }
    return drive;
  }

  async getDriveBySlug(slug: string) {
    for (const driveId of Object.keys(this.driveManifests)) {
      const drive = this.documents[`drive/${driveId}`] as DocumentDriveDocument;
      if (drive.initialState.state.global.slug === slug) {
        return drive;
      }
    }

    throw new Error(`Drive with slug ${slug} not found`);
  }

  async createDrive(id: string, drive: DocumentDriveDocument) {
    // check if a drive with the same slug already exists
    const slug = drive.initialState.state.global.slug;
    if (slug) {
      let existingDrive;
      try {
        existingDrive = await this.getDriveBySlug(slug);
      } catch {
        // do nothing
      }
      if (existingDrive) {
        throw new Error(`Drive with slug ${slug} already exists`);
      }
    }

    await this.create(`drive/${id}`, drive);

    // Initialize an empty manifest for the new drive
    this.updateDriveManifest(id, { documentIds: new Set() });
  }

  async addDriveOperations(
    id: string,
    operations: OperationFromDocument<DocumentDriveDocument>[],
    header: DocumentHeader,
  ): Promise<void> {
    const drive = await this.getDrive(id);
    const mergedOperations = mergeOperations<DocumentDriveDocument>(
      drive.operations,
      operations,
    );

    this.documents[`drive/${id}`] = {
      ...drive,
      ...header,
      operations: mergedOperations,
    };
  }

  async deleteDrive(id: string) {
    // Get all documents in this drive
    const manifest = this.getDriveManifest(id);

    // delete each document that belongs only to this drive
    const drives = await this.getDrives();
    await Promise.all(
      [...manifest.documentIds].map((docId) => {
        for (const driveId of drives) {
          if (driveId === id) {
            continue;
          }

          const manifest = this.getDriveManifest(driveId);
          if (manifest.documentIds.has(docId)) {
            return;
          }
        }

        delete this.documents[docId];
      }),
    );

    // Delete the drive manifest and the drive itself
    delete this.driveManifests[id];
    delete this.documents[id];
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

  ////////////////////////////////
  // Private
  ////////////////////////////////

  private getDriveManifest(driveId: string): DriveManifest {
    if (!this.driveManifests[driveId]) {
      this.driveManifests[driveId] = { documentIds: new Set() };
    }

    return this.driveManifests[driveId];
  }

  private updateDriveManifest(driveId: string, manifest: DriveManifest): void {
    this.driveManifests[driveId] = manifest;
  }
}
