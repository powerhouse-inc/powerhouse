// @ts-nocheck
// TODO fix interface errors
import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
} from "#drive-document-model/gen/types";
import {
  DocumentAlreadyExistsError,
  DocumentAlreadyExistsReason,
  DocumentIdValidationError,
  DocumentNotFoundError,
  DocumentSlugValidationError,
} from "#server/error";
import { type SynchronizationUnitQuery } from "#server/types";
import { mergeOperations } from "#utils/misc";
import { mfs, type MFS } from "@helia/mfs";
import {
  type Operation,
  type PHDocument,
  type PHDocumentHeader,
} from "document-model";
import { type Helia } from "helia";
import stringify from "json-stringify-deterministic";
import type { IDocumentOperationStorage, IDocumentStorage } from "./types.js";
import { isValidDocumentId, isValidSlug } from "./utils.js";

// Interface for drive manifest that tracks document IDs in a drive
interface DriveManifest {
  documentIds: string[];
}

// Interface for slug manifest that maps slugs to document IDs
interface SlugManifest {
  slugToId: Record<string, string>;
}

export class IPFSStorage
  implements IDriveStorage, IDocumentOperationStorage, IDocumentStorage
{
  private fs: MFS;

  constructor(helia: Helia) {
    this.fs = mfs(helia);
  }

  ////////////////////////////////
  // IDocumentView
  ////////////////////////////////
  async resolveIds(slugs: string[], signal?: AbortSignal): Promise<string[]> {
    const ids = [];
    for (const slug of slugs) {
      const documentId = this.slugToDocumentId[slug];
      if (!documentId) {
        throw new DocumentNotFoundError(slug);
      }

      ids.push(documentId);
    }

    if (signal?.aborted) {
      throw new AbortError("Aborted");
    }

    return Promise.resolve(ids);
  }

  async resolveSlugs(ids: string[], signal?: AbortSignal): Promise<string[]> {
    const slugs = [];
    for (const id of ids) {
      const document = await this.get<PHDocument>(id);
      if (!document) {
        throw new DocumentNotFoundError(id);
      }

      if (signal?.aborted) {
        throw new AbortError("Aborted");
      }

      slugs.push(document.slug);
    }

    return Promise.resolve(slugs);
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

  async create(document: PHDocument): Promise<void> {
    const documentId = document.id;
    if (!isValidDocumentId(documentId)) {
      throw new DocumentIdValidationError(documentId);
    }

    if (await this.exists(documentId)) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    const slug =
      document.header.slug?.length > 0 ? document.header.slug : documentId;
    if (!isValidSlug(slug)) {
      throw new DocumentSlugValidationError(slug);
    }

    const slugManifest = await this.getSlugManifest();
    if (slugManifest.slugToId[slug]) {
      throw new DocumentAlreadyExistsError(
        documentId,
        DocumentAlreadyExistsReason.SLUG,
      );
    }

    document.header.slug = slug;
    await this.fs.writeBytes(
      new TextEncoder().encode(stringify(document)),
      this._buildDocumentPath(documentId),
    );

    // Update the slug manifest if the document has a slug
    slugManifest.slugToId[slug] = documentId;
    await this.updateSlugManifest(slugManifest);

    // temporary: initialize an empty manifest for new drives
    if (document.header.documentType === "powerhouse/document-drive") {
      this.updateDriveManifest(documentId, { documentIds: [] });
    }
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
      return Promise.reject(new DocumentNotFoundError(documentId));
    }
  }

  async getBySlug<TDocument extends PHDocument>(
    slug: string,
  ): Promise<TDocument> {
    const slugManifest = await this.getSlugManifest();
    const documentId = slugManifest.slugToId[slug];

    if (!documentId) {
      return Promise.reject(new DocumentNotFoundError(slug));
    }

    return this.get<TDocument>(documentId);
  }

  async findByType(
    documentModelType: string,
    limit = 100,
    cursor?: string,
  ): Promise<{
    documents: string[];
    nextCursor: string | undefined;
  }> {
    // Get all document files from IPFS
    const documentFiles = [];
    try {
      for await (const entry of this.fs.ls("/")) {
        if (
          entry.name.startsWith("document-") &&
          entry.name.endsWith(".json")
        ) {
          documentFiles.push(entry.name);
        }
      }
    } catch (error) {
      // If directory listing fails, return empty results
      return { documents: [], nextCursor: undefined };
    }

    // Load documents with matching type and collect their metadata
    const documentsAndIds: Array<{ id: string; document: PHDocument }> = [];

    for (const fileName of documentFiles) {
      // Extract the document ID from the filename
      const documentId = fileName.replace("document-", "").replace(".json", "");

      try {
        // Read and parse the document from IPFS
        const chunks = [];
        for await (const chunk of this.fs.cat(`/${fileName}`)) {
          chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);
        const content = new TextDecoder().decode(buffer);
        const document = JSON.parse(content) as PHDocument;

        // Only include documents of the requested type
        if (document.header.documentType === documentModelType) {
          documentsAndIds.push({ id: documentId, document });
        }
      } catch (error) {
        // Skip files that can't be read or parsed
        continue;
      }
    }

    // Sort by creation date first, then by ID
    documentsAndIds.sort((a, b) => {
      const aDate = new Date(a.document.header.createdAtUtcIso);
      const bDate = new Date(b.document.header.createdAtUtcIso);

      if (aDate.getTime() === bDate.getTime()) {
        return a.id.localeCompare(b.id);
      }

      return aDate.getTime() - bDate.getTime();
    });

    // cursor
    let startIndex = 0;
    if (cursor) {
      const index = documentsAndIds.findIndex(({ id }) => id === cursor);
      if (index !== -1) {
        startIndex = index;
      }
    }

    // count to limit
    const endIndex = Math.min(startIndex + limit, documentsAndIds.length);

    let nextCursor: string | undefined;
    if (endIndex < documentsAndIds.length) {
      nextCursor = documentsAndIds[endIndex].id;
    }

    return {
      documents: documentsAndIds
        .slice(startIndex, endIndex)
        .map(({ id }) => id),
      nextCursor,
    };
  }

  async delete(documentId: string): Promise<boolean> {
    // Remove from slug manifest if it has a slug
    try {
      const document = await this.get<PHDocument>(documentId);
      const slug =
        document.header.slug?.length > 0 ? document.header.slug : documentId;

      if (slug) {
        const slugManifest = await this.getSlugManifest();
        if (slugManifest.slugToId[slug] === documentId) {
          delete slugManifest.slugToId[slug];
          await this.updateSlugManifest(slugManifest);
        }
      }
    } catch (error) {
      // If we can't get the document, we can't remove its slug
    }

    // delete the document from parent manifests
    const parents = await this.getParents(documentId);
    for (const parent of parents) {
      await this.removeChild(parent, documentId);
    }

    // check children: any children that are only children of this document should be deleted
    const children = await this.getChildren(documentId);
    for (const child of children) {
      const childParents = await this.getParents(child);
      if (childParents.length === 1 && childParents[0] === documentId) {
        await this.delete(child);
      }
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

  async getParents(childId: string): Promise<string[]> {
    const parents: string[] = [];

    // Get all manifest files by listing the directory and finding manifest files
    try {
      for await (const entry of this.fs.ls("/")) {
        if (
          entry.name.startsWith("manifest-") &&
          entry.name.endsWith(".json")
        ) {
          // Extract the driveId from the manifest filename
          const driveId = entry.name
            .replace("manifest-", "")
            .replace(".json", "");

          // Check if the manifest contains the childId
          const manifest = await this.getDriveManifest(driveId);
          if (manifest.documentIds.includes(childId)) {
            parents.push(driveId);
          }
        }
      }
    } catch (error) {
      // If listing fails, return empty array
    }

    return parents;
  }

  // IDriveStorage
  ////////////////////////////////

  async addDocumentOperations<TDocument extends PHDocument>(
    drive: string,
    id: string,
    operations: Operation[],
    header: PHDocumentHeader,
  ): Promise<void> {
    const document = await this.get<TDocument>(id);
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }

    const mergedOperations = mergeOperations(document.operations, operations);

    await this.create(id, {
      ...document,
      header,
      operations: mergedOperations,
    });
    await this.addChild(drive, id);
  }

  async getDrives(): Promise<string[]> {
    const result = await this.findByType("powerhouse/document-drive");
    return result.documents;
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
      throw new Error(`Drive with id ${id} not found`);
    }
  }

  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    header: PHDocumentHeader,
  ): Promise<void> {
    const drive = await this.getDrive(id);
    const mergedOperations = mergeOperations<DocumentDriveDocument>(
      drive.operations,
      operations,
    );

    await this.create(id, {
      ...drive,
      header,
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
          const operation = document.operations[unit.scope].at(-1);
          if (operation) {
            return {
              documentId: unit.documentId,
              scope: unit.scope,
              branch: unit.branch,
              lastUpdated: operation.timestampUtcMs,
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

  private _buildSlugManifestPath(): string {
    return `/slugs.json`;
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

  private async getSlugManifest(): Promise<SlugManifest> {
    try {
      const manifestPath = this._buildSlugManifestPath();
      const chunks = [];
      for await (const chunk of this.fs.cat(manifestPath)) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const content = new TextDecoder().decode(buffer);
      return JSON.parse(content) as SlugManifest;
    } catch (error) {
      // If manifest doesn't exist, return an empty one
      return { slugToId: {} };
    }
  }

  private async updateSlugManifest(manifest: SlugManifest): Promise<void> {
    const manifestPath = this._buildSlugManifestPath();
    const manifestContent = stringify(manifest);
    const manifestBuffer = new TextEncoder().encode(manifestContent);
    await this.fs.writeBytes(manifestBuffer, manifestPath, { force: true });
  }
}
