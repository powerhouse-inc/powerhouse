import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
} from "#drive-document-model/gen/types";
import { DriveNotFoundError } from "#server/error";
import { type SynchronizationUnitQuery } from "#server/types";
import { mergeOperations } from "#utils/misc";
import { mfs, type MFS } from "@helia/mfs";
import {
  type DocumentHeader,
  type Operation,
  type OperationScope,
  type PHDocument,
} from "document-model";
import { type Helia } from "helia";
import stringify from "json-stringify-deterministic";
import type { IDocumentStorage, IStorage } from "./types.js";

// Interface for drive manifest that tracks document IDs in a drive
interface DriveManifest {
  documentIds: string[];
}

export class IPFSStorage implements IStorage, IDocumentStorage {
  private fs: MFS;

  constructor(helia: Helia) {
    this.fs = mfs(helia);
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  async exists(documentId: string): Promise<boolean> {
    try {
      await this.fs.stat(this._buildDocumentPath(documentId));

      return true;
    } catch (error) {
      //
    }

    try {
      await this.fs.stat(this._buildDrivePath(documentId));
      return true;
    } catch (error) {
      //
    }

    return false;
  }

  async create(documentId: string, document: PHDocument): Promise<void> {
    await this.fs.writeBytes(
      new TextEncoder().encode(stringify(document)),
      this._buildDocumentPath(documentId),
    );
  }

  async get<TDocument extends PHDocument>(
    documentId: string,
  ): Promise<TDocument> {
    try {
      const documentPath = this._buildDocumentPath(documentId);

      const chunks = [];
      for await (const chunk of this.fs.cat(documentPath)) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      const content = new TextDecoder().decode(buffer);

      return JSON.parse(content) as TDocument;
    } catch (error) {
      throw new Error(`Document with id ${documentId} not found`);
    }
  }

  async delete(documentId: string): Promise<boolean> {
    // delete the document from all other drive manifests
    const drives = await this.getDrives();
    for (const driveId of drives) {
      if (driveId === documentId) continue;

      await this.removeChild(driveId, documentId);
    }

    // delete any manifest for this document
    try {
      await this.fs.rm(this._buildDriveManifestPath(documentId));
    } catch (error) {
      // there may be no manifest for this document
    }

    // finally, delete the specified document
    try {
      await this.fs.rm(this._buildDocumentPath(documentId));
      return true;
    } catch (error) {
      return false;
    }
  }

  async addChild(parentId: string, childId: string): Promise<void> {
    if (parentId === childId) {
      throw new Error("Cannot associate a document with itself");
    }

    // check if the child is a parent of the parent
    const children = await this.getChildren(childId);
    if (children.includes(parentId)) {
      throw new Error("Cannot associate a document with its child");
    }

    const manifest = await this.getDriveManifest(parentId);
    if (!manifest.documentIds.includes(childId)) {
      manifest.documentIds.push(childId);
      await this.updateDriveManifest(parentId, manifest);
    }
  }

  async removeChild(parentId: string, childId: string): Promise<boolean> {
    const manifest = await this.getDriveManifest(parentId);
    const docIndex = manifest.documentIds.indexOf(childId);
    if (docIndex !== -1) {
      manifest.documentIds.splice(docIndex, 1);
      await this.updateDriveManifest(parentId, manifest);
      return true;
    }

    return false;
  }

  async getChildren(parentId: string): Promise<string[]> {
    const manifest = await this.getDriveManifest(parentId);
    return manifest.documentIds;
  }

  // IDriveStorage
  ////////////////////////////////

  async checkDocumentExists(drive: string, id: string): Promise<boolean> {
    return this.exists(id);
  }

  async getDocuments(drive: string): Promise<string[]> {
    const manifest = await this.getDriveManifest(drive);
    return manifest.documentIds;
  }

  async createDocument(
    drive: string,
    id: string,
    document: PHDocument,
  ): Promise<void> {
    await this.create(id, document);

    // Update the drive manifest to include this document
    const manifest = await this.getDriveManifest(drive);
    if (!manifest.documentIds.includes(id)) {
      manifest.documentIds.push(id);
      await this.updateDriveManifest(drive, manifest);
    }

    return Promise.resolve();
  }

  async deleteDocument(drive: string, id: string): Promise<void> {
    // Update the drive manifest to remove this document
    const manifest = await this.getDriveManifest(drive);
    const docIndex = manifest.documentIds.indexOf(id);
    if (docIndex !== -1) {
      manifest.documentIds.splice(docIndex, 1);
      await this.updateDriveManifest(drive, manifest);
    }

    // Check if this document exists in other drive manifests
    // Only delete the actual file if no other drive references it
    const drives = await this.getDrives();
    for (const driveId of drives) {
      if (driveId === drive) continue;

      const otherManifest = await this.getDriveManifest(driveId);
      if (otherManifest.documentIds.includes(id)) {
        // Document still referenced by another drive, don't delete the file
        return Promise.resolve();
      }
    }

    // If we got here, no other drive references this document, so we can delete it
    try {
      await this.fs.rm(this._buildDocumentPath(id));
      return Promise.resolve();
    } catch (error) {
      // If file doesn't exist, consider it deleted already
      return Promise.resolve();
    }
  }

  async addDocumentOperations<TDocument extends PHDocument>(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void> {
    const document = await this.get<TDocument>(id);
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    const mergedOperations = mergeOperations(document.operations, operations);

    await this.createDocument(drive, id, {
      ...document,
      ...header,
      operations: mergedOperations,
    });
  }

  async getDrives(): Promise<string[]> {
    try {
      // List all files in root directory
      const drives = [];
      for await (const entry of this.fs.ls("/")) {
        if (
          entry.name.startsWith("manifest-") &&
          entry.name.endsWith(".json")
        ) {
          const driveId = entry.name
            .replace("manifest-", "")
            .replace(".json", "");
          drives.push(driveId);
        }
      }
      return drives;
    } catch (error) {
      return [];
    }
  }

  async getDrive(id: string): Promise<DocumentDriveDocument> {
    try {
      const drivePath = this._buildDrivePath(id);
      const chunks = [];
      for await (const chunk of this.fs.cat(drivePath)) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const content = new TextDecoder().decode(buffer);
      return JSON.parse(content) as DocumentDriveDocument;
    } catch {
      throw new DriveNotFoundError(id);
    }
  }

  async getDriveBySlug(slug: string): Promise<DocumentDriveDocument> {
    // Get oldest drives first
    const drives = (await this.getDrives()).reverse();
    for (const drive of drives) {
      const {
        initialState: {
          state: {
            global: { slug: driveSlug },
          },
        },
      } = await this.getDrive(drive);
      if (driveSlug === slug) {
        return this.getDrive(drive);
      }
    }
    throw new Error(`Drive with slug ${slug} not found`);
  }

  async createDrive(id: string, drive: DocumentDriveDocument): Promise<void> {
    const drivePath = this._buildDrivePath(id);
    const driveContent = stringify(drive);
    const driveBuffer = new TextEncoder().encode(driveContent);

    // Write the drive to storage
    await this.fs.writeBytes(driveBuffer, drivePath);

    // Initialize an empty manifest for the new drive
    await this.updateDriveManifest(id, { documentIds: [] });

    return Promise.resolve();
  }

  async deleteDrive(id: string): Promise<void> {
    // Get all documents in this drive
    const manifest = await this.getDriveManifest(id);
    const documents = manifest.documentIds;

    // Delete each document from this drive (may not actually delete files if shared with other drives)
    await Promise.all(
      documents.map((document) => this.deleteDocument(id, document)),
    );

    // Delete the drive manifest
    try {
      await this.fs.rm(this._buildDriveManifestPath(id));
    } catch (error) {
      // If manifest doesn't exist, ignore the error
    }

    // Delete the drive document
    try {
      await this.fs.rm(this._buildDrivePath(id));
    } catch (error) {
      // If file doesn't exist, ignore the error
    }

    return Promise.resolve();
  }

  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    header: DocumentHeader,
  ): Promise<void> {
    const drive = await this.getDrive(id);
    const mergedOperations = mergeOperations<DocumentDriveDocument>(
      drive.operations,
      operations,
    );

    await this.createDrive(id, {
      ...drive,
      ...header,
      operations: mergedOperations,
    });
  }

  async clearStorage(): Promise<void> {
    // Delete all files
    try {
      for await (const entry of this.fs.ls("/")) {
        if (entry.type === "file") {
          await this.fs.rm(`/${entry.name}`);
        }
      }
    } catch (error) {
      // Ignore any errors when trying to list/delete files
    }
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
  // Private methods
  ////////////////////////////////

  private _buildDocumentPath(documentId: string): string {
    return `/document-${documentId}.json`;
  }

  private _buildDrivePath(driveId: string): string {
    return `/drive-${driveId}.json`;
  }

  private _buildDriveManifestPath(driveId: string): string {
    return `/manifest-${driveId}.json`;
  }

  private async getDriveManifest(driveId: string): Promise<DriveManifest> {
    try {
      const manifestPath = this._buildDriveManifestPath(driveId);
      const chunks = [];
      for await (const chunk of this.fs.cat(manifestPath)) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const content = new TextDecoder().decode(buffer);
      return JSON.parse(content) as DriveManifest;
    } catch (error) {
      // If manifest doesn't exist, return an empty one
      return { documentIds: [] };
    }
  }

  private async updateDriveManifest(
    driveId: string,
    manifest: DriveManifest,
  ): Promise<void> {
    const manifestPath = this._buildDriveManifestPath(driveId);
    const manifestContent = stringify(manifest);
    const manifestBuffer = new TextEncoder().encode(manifestContent);
    await this.fs.writeBytes(manifestBuffer, manifestPath, { force: true });
  }
}
