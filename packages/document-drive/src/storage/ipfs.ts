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
import { IDocumentStorage, IStorage } from "./types.js";

export class IPFSStorage implements IStorage, IDocumentStorage {
  private fs: MFS;
  private static DRIVES_DIR = "/drives";

  constructor(helia: Helia) {
    this.fs = mfs(helia);
  }

  private async _touchDrivesDir(): Promise<void> {
    // Ensure drives directory exists
    try {
      await this.fs.stat(IPFSStorage.DRIVES_DIR);
    } catch (error) {
      // If directory doesn't exist, create it
      await this.fs.mkdir(IPFSStorage.DRIVES_DIR);
    }
  }

  private _buildDocumentPath(documentId: string): string {
    return `/document-${documentId}.json`;
  }

  async exists(documentId: string): Promise<boolean> {
    try {
      await this.fs.stat(this._buildDocumentPath(documentId));
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkDocumentExists(drive: string, id: string): Promise<boolean> {
    return this.exists(id);
  }

  async getDocuments(drive: string): Promise<string[]> {
    try {
      // Create drive directory if it doesn't exist
      const driveDirPath = `/${drive}`;
      try {
        await this.fs.stat(driveDirPath);
      } catch (error) {
        // Directory doesn't exist
        return [];
      }

      // List all files in the drive directory
      const files = [];
      for await (const entry of this.fs.ls(driveDirPath)) {
        if (entry.type === "file" && entry.name.endsWith(".json")) {
          try {
            const documentId = entry.name.replace(".json", "");
            // Validate that this is a document by attempting to get it
            await this.getDocument(drive, documentId);
            files.push(documentId);
          } catch {
            /* Ignore invalid document */
          }
        }
      }
      return files;
    } catch (error) {
      // If drive directory doesn't exist, return empty array
      return [];
    }
  }

  async getDocument<TDocument extends PHDocument>(
    drive: string,
    id: string,
  ): Promise<TDocument> {
    try {
      const documentPath = this._buildDocumentPath(id);
      const chunks = [];
      for await (const chunk of this.fs.cat(documentPath)) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const content = new TextDecoder().decode(buffer);
      return JSON.parse(content) as TDocument;
    } catch (error) {
      throw new Error(`Document with id ${id} not found`);
    }
  }

  async createDocument(
    drive: string,
    id: string,
    document: PHDocument,
  ): Promise<void> {
    const documentPath = this._buildDocumentPath(id);
    const documentContent = stringify(document);
    const documentBuffer = new TextEncoder().encode(documentContent);

    // Ensure drive directory exists
    try {
      await this.fs.stat(`/${drive}`);
    } catch (error) {
      await this.fs.mkdir(`/${drive}`);
    }

    await this.fs.writeBytes(documentBuffer, documentPath);
    return Promise.resolve();
  }

  async deleteDocument(drive: string, id: string): Promise<void> {
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
    const document = await this.getDocument(drive, id);
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
      await this._touchDrivesDir();

      const drives = [];
      for await (const entry of this.fs.ls(IPFSStorage.DRIVES_DIR)) {
        if (entry.type === "file" && entry.name.endsWith(".json")) {
          try {
            const driveId = entry.name.replace(".json", "");
            // Validate that this is a drive by attempting to get it
            await this.getDrive(driveId);
            drives.push(driveId);
          } catch {
            /* Ignore invalid drive document found on drives dir */
          }
        }
      }
      return drives;
    } catch (error) {
      return [];
    }
  }

  async getDrive(id: string): Promise<DocumentDriveDocument> {
    try {
      return await this.getDocument(IPFSStorage.DRIVES_DIR, id);
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
    return this.createDocument(IPFSStorage.DRIVES_DIR, id, drive);
  }

  async deleteDrive(id: string): Promise<void> {
    const documents = await this.getDocuments(id);
    await this.deleteDocument(IPFSStorage.DRIVES_DIR, id);
    await Promise.all(
      documents.map((document) => this.deleteDocument(id, document)),
    );
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
    // Delete all files in the drives directory
    const drives = await this.getDrives();
    await Promise.all(
      drives.map(async (drive) => {
        await this.deleteDrive(drive);
      }),
    );

    // Delete all document files
    try {
      for await (const entry of this.fs.ls("/")) {
        if (
          entry.type === "file" &&
          entry.name.startsWith("document-") &&
          entry.name.endsWith(".json")
        ) {
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
