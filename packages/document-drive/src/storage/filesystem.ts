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
import { mergeOperations, operationsToRevision } from "#utils/misc";
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
import {
  IStorageUnit,
  IStorageUnitFilter,
  type IDocumentStorage,
  type IDriveOperationStorage,
} from "./types.js";
import {
  isValidDocumentId,
  isValidSlug,
  resolveStorageUnitsFilter,
} from "./utils.js";

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
  // IStorageUnitStorage
  ////////////////////////////////

  async findStorageUnitsBy(
    filter: IStorageUnitFilter,
    limit: number,
    cursor?: string,
  ): Promise<{ units: IStorageUnit[]; nextCursor?: string }> {
    const storageUnits: IStorageUnit[] = [];

    const {
      parentId: parentIds,
      documentId: documentIds,
      documentModelType: documentTypes,
      scope: scopes,
      branch: branches,
    } = resolveStorageUnitsFilter(filter);

    const files = await fs.readdir(this.basePath, { withFileTypes: true });
    const documentFiles = files
      .filter(
        (file) =>
          file.name.startsWith("document-") && file.name.endsWith(".json"),
      )
      .map((file) => file.name.replace("document-", "").replace(".json", ""));

    let documents: Set<string>;

    // apply parent id filter
    if (parentIds) {
      // join children from all parents
      const childrenIds = new Set<string>();
      for (const parentId of parentIds) {
        const ids = await this.getChildren(parentId);
        ids.forEach((id) => childrenIds.add(id));
      }
      documents = parentIds.union(childrenIds);
    } else {
      documents = new Set(documentFiles);
    }

    // apply document id filter
    documents = documentIds ? documentIds.intersection(documents) : documents;

    for (const documentId of documents) {
      const document = await this.get(documentId);
      // might be a child that has not been synced yet
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!document) continue;

      // apply document type filter
      if (documentTypes && !documentTypes.has(document.documentType)) continue;

      // For each operation scope in the document
      for (const [scope] of Object.entries(document.state)) {
        // apply scope filter
        if (scopes && !scopes.has(scope)) continue;

        // Create storage unit for this document+scope combination
        storageUnits.push({
          documentId,
          documentModelType: document.documentType,
          scope,
          branch: "main", // Default branch
        });
      }
    }

    // Handle pagination
    let startIndex = 0;
    if (cursor) {
      const index = storageUnits.findIndex(
        (unit) => unit.documentId === cursor,
      );
      if (index !== -1) {
        startIndex = index;
      }
    }

    // Calculate the range to return
    const endIndex = Math.min(startIndex + limit, storageUnits.length);
    const nextCursor =
      endIndex < storageUnits.length
        ? storageUnits[endIndex].documentId
        : undefined;

    return {
      units: storageUnits.slice(startIndex, endIndex),
      nextCursor,
    };
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  exists(documentId: string): Promise<boolean> {
    const documentExists = existsSync(this._buildDocumentPath(documentId));
    return Promise.resolve(documentExists);
  }

  async create(document: PHDocument) {
    const documentId = document.id;
    if (!isValidDocumentId(documentId)) {
      throw new DocumentIdValidationError(documentId);
    }

    const documentPath = this._buildDocumentPath(documentId);
    if (existsSync(documentPath)) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    const slug = document.slug.length > 0 ? document.slug : documentId;
    if (!isValidSlug(slug)) {
      throw new DocumentSlugValidationError(slug);
    }

    const slugManifest = await this.getSlugManifest();
    if (slugManifest.slugToId[slug]) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    document.slug = slug;
    writeFileSync(documentPath, stringify(document), {
      encoding: "utf-8",
    });

    // Update the slug manifest if the document has a slug

    slugManifest.slugToId[slug] = documentId;
    await this.updateSlugManifest(slugManifest);

    // temporary: initialize an empty manifest for new drives
    if (document.documentType === "powerhouse/document-drive") {
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
        if (document.documentType === documentModelType) {
          documentsAndIds.push({ id: documentId, document });
        }
      } catch (error) {
        // Skip files that can't be read or parsed
        continue;
      }
    }

    // Sort by creation date first, then by ID (consistent sort order for pagination)
    documentsAndIds.sort((a, b) => {
      const aDate = new Date(a.document.created);
      const bDate = new Date(b.document.created);

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
      const slug = document.slug.length > 0 ? document.slug : documentId;

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
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ) {
    const document = await this.get(id);
    if (!document) {
      return Promise.reject(new DocumentNotFoundError(id));
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
      documentType: string;
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
          if (!document || !document.operations[unit.scope as OperationScope]) {
            return undefined;
          }

          const operations = document.operations[unit.scope as OperationScope];

          return {
            documentId: unit.documentId,
            documentType: unit.documentType,
            scope: unit.scope,
            branch: unit.branch,
            lastUpdated: operations.at(-1)?.timestamp ?? document.created,
            revision: operationsToRevision(operations),
          };
        } catch {
          return undefined;
        }
      }),
    );
    return results.reduce<
      {
        documentId: string;
        documentType: string;
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
