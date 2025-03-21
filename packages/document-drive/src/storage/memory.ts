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
  private drives: Record<string, DocumentDriveDocument>;
  private driveManifests: Record<string, DriveManifest>;
  private slugToDriveId: Record<string, string> = {};

  constructor() {
    this.documents = {};
    this.drives = {};
    this.driveManifests = {};
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  exists(documentId: string): Promise<boolean> {
    return Promise.resolve(!!this.documents[documentId]);
  }

  create(documentId: string, document: PHDocument) {
    this.documents[documentId] = document;

    return Promise.resolve();
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

  async getDocument<TDocument extends PHDocument>(
    driveId: string,
    id: string,
  ): Promise<TDocument> {
    const document = this.documents[id];
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    return document as TDocument;
  }

  async saveDocument(drive: string, id: string, document: PHDocument) {
    this.documents[id] = document;

    // Update the drive manifest
    const manifest = this.getDriveManifest(drive);
    manifest.documentIds.add(id);
    this.updateDriveManifest(drive, manifest);
  }

  async clearStorage(): Promise<void> {
    this.documents = {};
    this.drives = {};
    this.driveManifests = {};
    this.slugToDriveId = {};
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
    // delete the document from all drive manifests
    const drives = await this.getDrives();
    for (const driveId of drives) {
      const manifest = this.getDriveManifest(driveId);
      if (manifest.documentIds.has(id)) {
        manifest.documentIds.delete(id);
        this.updateDriveManifest(driveId, manifest);
      }
    }

    delete this.documents[id];
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

  async createDrive(id: string, drive: DocumentDriveDocument) {
    this.drives[id] = drive;

    // Initialize an empty manifest for the new drive
    this.updateDriveManifest(id, { documentIds: new Set() });

    const { slug } = drive.initialState.state.global;
    if (slug) {
      this.slugToDriveId[slug] = id;
    }
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

    this.drives[id] = {
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
    delete this.drives[id];

    // Clean up slug mapping if needed
    for (const [slug, driveId] of Object.entries(this.slugToDriveId)) {
      if (driveId === id) {
        delete this.slugToDriveId[slug];
      }
    }
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
