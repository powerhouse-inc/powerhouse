import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
} from "#drive-document-model/gen/types";
import {
  DocumentAlreadyExistsError,
  DocumentIdValidationError,
  DocumentNotFoundError,
  DocumentSlugValidationError,
} from "#server/error";
import { type SynchronizationUnitQuery } from "#server/types";
import { AbortError } from "#utils/errors";
import { mergeOperations } from "#utils/misc";
import {
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
import { type IDocumentStorage, type IDriveOperationStorage } from "./types.js";
import { isValidDocumentId, isValidSlug } from "./utils.js";

// Interface for drive manifest that tracks document IDs in a drive
interface DriveManifest {
  documentIds: string[];
}

// Interface for slug manifest that maps slugs to document IDs
interface SlugManifest {
  slugToId: Record<string, string>;
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class FilesystemStorage
  implements IDriveOperationStorage, IDocumentStorage
{
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    ensureDir(this.basePath);
  }

  ////////////////////////////////
  // IDocumentView
  ////////////////////////////////
  async resolveIds(slugs: string[], signal?: AbortSignal): Promise<string[]> {
    const slugManifest = await this.getSlugManifest();

    if (signal?.aborted) {
      throw new AbortError("Aborted");
    }

    const ids: string[] = [];
    for (const slug of slugs) {
      const documentId = slugManifest.slugToId[slug];
      if (!documentId) {
        throw new DocumentNotFoundError(slug);
      }

      ids.push(documentId);
    }

    return Promise.resolve(ids);
  }

  async resolveSlugs(ids: string[], signal?: AbortSignal): Promise<string[]> {
    const slugs: string[] = [];
    for (const id of ids) {
      const document = await this.get<PHDocument>(id);
      if (!document) {
        throw new DocumentNotFoundError(id);
      }

      if (signal?.aborted) {
        throw new AbortError("Aborted");
      }

      slugs.push(document.header.slug);
    }

    return Promise.resolve(slugs);
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  exists(documentId: string): Promise<boolean> {
    const documentExists = existsSync(this._buildDocumentPath(documentId));
    return Promise.resolve(documentExists);
  }

  async create(document: PHDocument) {
    const documentId = document.header.id;
    if (!isValidDocumentId(documentId)) {
      throw new DocumentIdValidationError(documentId);
    }

    const documentPath = this._buildDocumentPath(documentId);
    if (existsSync(documentPath)) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    const slug =
      document.header.slug?.length > 0 ? document.header.slug : documentId;
    if (!isValidSlug(slug)) {
      throw new DocumentSlugValidationError(slug);
    }

    const slugManifest = await this.getSlugManifest();
    if (slugManifest.slugToId[slug]) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    document.header.slug = slug;
    writeFileSync(documentPath, stringify(document), {
      encoding: "utf-8",
    });

    // Update the slug manifest if the document has a slug

    slugManifest.slugToId[slug] = documentId;
    await this.updateSlugManifest(slugManifest);

    // temporary: initialize an empty manifest for new drives
    if (document.header.documentType === "powerhouse/document-drive") {
      this.updateDriveManifest(documentId, { documentIds: [] });
    }

    return Promise.resolve();
  }

  get<TDocument extends PHDocument>(documentId: string): Promise<TDocument> {
    try {
      const content = readFileSync(this._buildDocumentPath(documentId), {
        encoding: "utf-8",
      });

      return Promise.resolve(JSON.parse(content) as TDocument);
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
    const files = await fs.readdir(this.basePath, { withFileTypes: true });
    const documentFiles = files.filter(
      (file) =>
        file.name.startsWith("document-") && file.name.endsWith(".json"),
    );

    // Load documents with matching type and collect their metadata
    const documentsAndIds: Array<{ id: string; document: PHDocument }> = [];
    for (const file of documentFiles) {
      const documentId = file.name
        .replace("document-", "")
        .replace(".json", "");

      try {
        // Read and parse the document
        const document = JSON.parse(
          readFileSync(this._buildDocumentPath(documentId), {
            encoding: "utf-8",
          }),
        ) as PHDocument;

        // Only include documents of the requested type
        if (document.header.documentType === documentModelType) {
          documentsAndIds.push({ id: documentId, document });
        }
      } catch (error) {
        // Skip files that can't be read or parsed
        continue;
      }
    }

    // Sort by creation date first, then by ID (consistent sort order for pagination)
    documentsAndIds.sort((a, b) => {
      const aDate = new Date(a.document.header.createdAtUtcIso);
      const bDate = new Date(b.document.header.createdAtUtcIso);

      if (aDate.getTime() === bDate.getTime()) {
        return a.id.localeCompare(b.id);
      }

      return aDate.getTime() - bDate.getTime();
    });

    let startIndex = 0;
    if (cursor) {
      const index = documentsAndIds.findIndex(({ id }) => id === cursor);
      if (index !== -1) {
        startIndex = index;
      }
    }

    // cursor
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
    // First, find any slug for this document and remove it from the slug manifest
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

    // delete from parent manifests
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

  async getParents(childId: string): Promise<string[]> {
    const parents: string[] = [];

    // Get all files in the base directory
    const files = await fs.readdir(this.basePath, { withFileTypes: true });

    // Filter to only include manifest files
    const manifestFiles = files.filter(
      (file) =>
        file.name.startsWith("manifest-") && file.name.endsWith(".json"),
    );

    // Check each manifest file to see if it contains the childId
    for (const file of manifestFiles) {
      // Extract the driveId from the manifest filename
      const driveId = file.name.replace("manifest-", "").replace(".json", "");

      const manifest = await this.getManifest(driveId);
      if (manifest.documentIds.includes(childId)) {
        parents.push(driveId);
      }
    }

    return parents;
  }

  ////////////////////////////////
  // IDocumentAdminStorage
  ////////////////////////////////

  async clear() {
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

  ////////////////////////////////
  // IDriveStorage
  ////////////////////////////////

  async addDocumentOperations(
    drive: string,
    id: string,
    operations: Operation[],
    document: PHDocument,
  ) {
    const existingDocument = await this.get(id);
    if (!existingDocument) {
      return Promise.reject(new DocumentNotFoundError(id));
    }

    const mergedOperations = mergeOperations(document.operations, operations);

    const documentPath = this._buildDocumentPath(id);
    writeFileSync(
      documentPath,
      stringify({
        ...existingDocument,
        ...document,
        operations: mergedOperations,
      }),
      {
        encoding: "utf-8",
      },
    );
  }

  async addDriveOperations(
    id: string,
    operations: Operation<DocumentDriveAction>[],
    document: PHDocument,
  ): Promise<void> {
    const existingDocument = await this.get<DocumentDriveDocument>(id);
    const mergedOperations = mergeOperations<DocumentDriveDocument>(
      existingDocument.operations,
      operations,
    );

    const drivePath = this._buildDocumentPath(id);
    writeFileSync(
      drivePath,
      stringify({
        ...existingDocument,
        ...document,
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

  private _buildSlugManifestPath() {
    return `${this.basePath}/slugs.json`;
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

  private async getSlugManifest(): Promise<SlugManifest> {
    const slugManifestPath = this._buildSlugManifestPath();
    try {
      const content = readFileSync(slugManifestPath, { encoding: "utf-8" });
      return JSON.parse(content) as SlugManifest;
    } catch (error) {
      // Return empty slug manifest if file doesn't exist
      return { slugToId: {} };
    }
  }

  private async updateSlugManifest(manifest: SlugManifest): Promise<void> {
    const slugManifestPath = this._buildSlugManifestPath();
    writeFileSync(slugManifestPath, stringify(manifest), { encoding: "utf-8" });
  }
}
