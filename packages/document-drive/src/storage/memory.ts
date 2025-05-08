import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { DocumentNotFoundError } from "#server/error";
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
  private slugToDocumentId: Record<string, string>;

  constructor() {
    this.documents = {};
    this.driveManifests = {};
    this.slugToDocumentId = {};
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  exists(documentId: string): Promise<boolean> {
    return Promise.resolve(!!this.documents[documentId]);
  }

  // TODO: this should throw an error if the document already exists.
  create(documentId: string, document: PHDocument) {
    this.documents[documentId] = document;

    // Add slug to lookup if it exists
    const slug = (document.initialState.state.global as any)?.slug;
    if (slug) {
      // check if the slug is already taken
      if (this.slugToDocumentId[slug]) {
        throw new Error(`Document with slug ${slug} already exists`);
      }

      this.slugToDocumentId[slug] = documentId;
    }

    return Promise.resolve();
  }

  get<TDocument extends PHDocument>(documentId: string): Promise<TDocument> {
    const document = this.documents[documentId];
    if (!document) {
      return Promise.reject(new DocumentNotFoundError(documentId));
    }

    return Promise.resolve(document as TDocument);
  }

  getBySlug<TDocument extends PHDocument>(slug: string): Promise<TDocument> {
    const documentId = this.slugToDocumentId[slug];

    if (!documentId) {
      return Promise.reject(new DocumentNotFoundError(slug));
    }

    return this.get<TDocument>(documentId);
  }

  async delete(documentId: string): Promise<boolean> {
    // Remove from slug lookup if it has a slug
    const document = this.documents[documentId];
    if (document) {
      const slug = (document.initialState.state.global as any)?.slug;
      if (slug && this.slugToDocumentId[slug] === documentId) {
        delete this.slugToDocumentId[slug];
      }
    }

    // delete the document from all other drive manifests
    const drives = await this.getDrives();
    for (const driveId of drives) {
      if (driveId === documentId) continue;

      await this.removeChild(driveId, documentId);
    }

    // delete any manifest for this document
    delete this.driveManifests[documentId];

    if (this.documents[documentId]) {
      delete this.documents[documentId];

      return Promise.resolve(true);
    }

    return Promise.resolve(false);
  }

  async addChild(parentId: string, childId: string) {
    if (parentId === childId) {
      return Promise.reject(
        new Error("Cannot associate a document with itself"),
      );
    }

    // check if the child is a parent of the parent
    const children = await this.getChildren(childId);
    if (children.includes(parentId)) {
      return Promise.reject(
        new Error("Cannot associate a document with its child"),
      );
    }

    const manifest = this.getManifest(parentId);
    manifest.documentIds.add(childId);
    this.updateDriveManifest(parentId, manifest);

    return Promise.resolve();
  }

  async removeChild(parentId: string, childId: string) {
    const manifest = this.getManifest(parentId);
    if (manifest.documentIds.delete(childId)) {
      this.updateDriveManifest(parentId, manifest);
      return Promise.resolve(true);
    }

    return Promise.resolve(false);
  }

  async getChildren(parentId: string): Promise<string[]> {
    const manifest = this.getManifest(parentId);
    return [...manifest.documentIds];
  }

  ////////////////////////////////
  // IDriveStorage
  ////////////////////////////////

  async clearStorage(): Promise<void> {
    this.documents = {};
    this.driveManifests = {};
    this.slugToDocumentId = {};
  }

  async addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void> {
    const document = await this.get(id);
    if (!document) {
      return Promise.reject(new DocumentNotFoundError(id));
    }

    const mergedOperations = mergeOperations(document.operations, operations);

    this.documents[id] = {
      ...document,
      ...header,
      operations: mergedOperations,
    };
  }

  async getDrives() {
    return Object.keys(this.driveManifests);
  }

  async createDrive(id: string, drive: DocumentDriveDocument) {
    await this.create(id, drive);

    // Initialize an empty manifest for the new drive
    this.updateDriveManifest(id, { documentIds: new Set() });
  }

  async addDriveOperations(
    id: string,
    operations: OperationFromDocument<DocumentDriveDocument>[],
    header: DocumentHeader,
  ): Promise<void> {
    const drive = await this.get<DocumentDriveDocument>(id);
    const mergedOperations = mergeOperations<DocumentDriveDocument>(
      drive.operations,
      operations,
    );

    this.documents[id] = {
      ...drive,
      ...header,
      operations: mergedOperations,
    };
  }

  async deleteDrive(id: string) {
    // Get all documents in this drive
    const manifest = this.getManifest(id);

    // delete each document that belongs only to this drive
    const drives = await this.getDrives();
    await Promise.all(
      [...manifest.documentIds].map((docId) => {
        for (const driveId of drives) {
          if (driveId === id) {
            continue;
          }

          const manifest = this.getManifest(driveId);
          if (manifest.documentIds.has(docId)) {
            return;
          }
        }

        // Remove from slug lookup if needed
        const document = this.documents[docId];
        if (document) {
          const slug = (document.initialState.state.global as any)?.slug;
          if (slug && this.slugToDocumentId[slug] === docId) {
            delete this.slugToDocumentId[slug];
          }
        }

        delete this.documents[docId];
      }),
    );

    // Delete the drive manifest and the drive itself
    await this.delete(id);
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

  private getManifest(driveId: string): DriveManifest {
    if (!this.driveManifests[driveId]) {
      this.driveManifests[driveId] = { documentIds: new Set() };
    }

    return this.driveManifests[driveId];
  }

  private updateDriveManifest(driveId: string, manifest: DriveManifest): void {
    this.driveManifests[driveId] = manifest;
  }
}
