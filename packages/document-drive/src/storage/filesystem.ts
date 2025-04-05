import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
} from "#drive-document-model/gen/types";
import { type SynchronizationUnitQuery } from "#server/types";
import { mergeOperations } from "#utils/misc";
import {
  type DocumentHeader,
  type Operation,
  type OperationScope,
  type PHDocument,
} from "document-model";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import fs from "fs/promises";
import stringify from "json-stringify-deterministic";
import path from "path";
import { type IDocumentStorage, type IDriveStorage } from "./types.js";

// Interface for drive manifest that tracks document IDs in a drive
interface DriveManifest {
  documentIds: string[];
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class FilesystemStorage implements IDriveStorage, IDocumentStorage {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    ensureDir(this.basePath);
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  exists(documentId: string): Promise<boolean> {
    const documentExists = existsSync(this._buildDocumentPath(documentId));
    return Promise.resolve(documentExists);
  }

  create(documentId: string, document: PHDocument) {
    const documentPath = this._buildDocumentPath(documentId);
    writeFileSync(documentPath, stringify(document), {
      encoding: "utf-8",
    });

    return Promise.resolve();
  }

  get<TDocument extends PHDocument>(documentId: string): Promise<TDocument> {
    try {
      const content = readFileSync(this._buildDocumentPath(documentId), {
        encoding: "utf-8",
      });

      return Promise.resolve(JSON.parse(content) as TDocument);
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
      await fs.rm(this._buildManifestPath(documentId));
    } catch (error) {
      // there may be no manifest for this document
    }

    // finally, delete the specified document
    const documentPath = this._buildDocumentPath(documentId);
    if (existsSync(documentPath)) {
      unlinkSync(documentPath);

      return Promise.resolve(true);
    }

    return Promise.resolve(false);
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

    // Update the drive manifest to include this document
    const manifest = await this.getManifest(parentId);
    if (!manifest.documentIds.includes(childId)) {
      manifest.documentIds.push(childId);
      await this.updateDriveManifest(parentId, manifest);
    }
  }

  async removeChild(parentId: string, childId: string): Promise<boolean> {
    const manifest = await this.getManifest(parentId);
    const docIndex = manifest.documentIds.indexOf(childId);
    if (docIndex !== -1) {
      manifest.documentIds.splice(docIndex, 1);
      await this.updateDriveManifest(parentId, manifest);
      return true;
    }

    return false;
  }

  async getChildren(parentId: string): Promise<string[]> {
    const manifest = await this.getManifest(parentId);
    return manifest.documentIds;
  }

  ////////////////////////////////
  // IDriveStorage
  ////////////////////////////////

  async clearStorage() {
    // delete content of basePath
    const files = (
      await fs.readdir(this.basePath, { withFileTypes: true })
    ).filter((dirent) => !!dirent.name);

    await Promise.all(
      files.map(async (dirent) => {
        await fs.rm(path.join(this.basePath, dirent.name), {
          recursive: true,
        });
      }),
    );
  }

  async addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ) {
    const document = await this.get(id);
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    const mergedOperations = mergeOperations(document.operations, operations);

    const documentPath = this._buildDocumentPath(id);
    writeFileSync(
      documentPath,
      stringify({
        ...document,
        ...header,
        operations: mergedOperations,
      }),
      {
        encoding: "utf-8",
      },
    );
  }

  async getDrives() {
    // get anything that starts with drive-
    const files = await fs.readdir(this.basePath, { withFileTypes: true });
    return (
      files
        .filter((file) => file.name.startsWith("manifest-"))
        // remove manifest- prefix and extension
        .map((file) => file.name.replace("manifest-", "").replace(".json", ""))
    );
  }

  async getDriveBySlug(slug: string) {
    // get oldest drives first
    const drives = (await this.getDrives()).reverse();
    for (const drive of drives) {
      const {
        initialState: {
          state: {
            global: { slug: driveSlug },
          },
        },
      } = await this.get<DocumentDriveDocument>(drive);
      if (driveSlug === slug) {
        return this.get<DocumentDriveDocument>(drive);
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

    await this.create(id, drive);

    // Initialize an empty manifest for the new drive
    await this.updateDriveManifest(id, { documentIds: [] });
  }

  async deleteDrive(id: string) {
    // First get all documents in this drive
    const documents = await this.getChildren(id);

    // Delete each document from this drive (may not actually delete the file if shared with other drives)
    await Promise.all(documents.map((doc) => this.delete(doc)));

    // Delete the drive manifest and the drive itself
    await fs.rm(this._buildManifestPath(id));
    await fs.rm(this._buildDocumentPath(id));
  }

  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    header: DocumentHeader,
  ): Promise<void> {
    const drive = await this.get<DocumentDriveDocument>(id);
    const mergedOperations = mergeOperations<DocumentDriveDocument>(
      drive.operations,
      operations,
    );

    const drivePath = this._buildDocumentPath(id);
    writeFileSync(
      drivePath,
      stringify({
        ...drive,
        ...header,
        operations: mergedOperations,
      }),
      {
        encoding: "utf-8",
      },
    );
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

  private _buildDocumentPath(documentId: string) {
    return `${this.basePath}/document-${documentId}.json`;
  }

  private _buildManifestPath(driveId: string) {
    return `${this.basePath}/manifest-${driveId}.json`;
  }

  private async getManifest(driveId: string): Promise<DriveManifest> {
    const manifestPath = this._buildManifestPath(driveId);
    try {
      const content = readFileSync(manifestPath, { encoding: "utf-8" });
      return JSON.parse(content) as DriveManifest;
    } catch (error) {
      // Return empty manifest if file doesn't exist
      return { documentIds: [] };
    }
  }

  private async updateDriveManifest(
    driveId: string,
    manifest: DriveManifest,
  ): Promise<void> {
    const manifestPath = this._buildManifestPath(driveId);
    writeFileSync(manifestPath, stringify(manifest), { encoding: "utf-8" });
  }
}
