import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import {
  DocumentAlreadyExistsError,
  DocumentAlreadyExistsReason,
  DocumentIdValidationError,
  DocumentNotFoundError,
  DocumentSlugValidationError,
} from "#server/error";
import { type SynchronizationUnitQuery } from "#server/types";
import { AbortError } from "#utils/errors";
import { migrateDocumentOperationSignatures } from "#utils/migrations";
import { mergeOperations, operationsToRevision } from "#utils/misc";
import type { Operation, PHDocument } from "document-model";
import LocalForage from "localforage";
import {
  type IDocumentAdminStorage,
  type IDocumentStorage,
  type IDriveOperationStorage,
  type IStorageUnit,
  type IStorageUnitFilter,
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

export class BrowserStorage
  implements IDriveOperationStorage, IDocumentStorage, IDocumentAdminStorage
{
  private db: Promise<LocalForage>;

  static DBName = "DOCUMENT_DRIVES";
  static SEP = ":";
  static DOCUMENT_KEY = "DOCUMENT";
  static MANIFEST_KEY = "MANIFEST";
  static SLUG_MANIFEST_KEY = "SLUG_MANIFEST";

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

    const db = await this.db;
    const keys = await db.keys();
    const documentKeys = keys
      .filter((key) =>
        key.startsWith(`${BrowserStorage.DOCUMENT_KEY}${BrowserStorage.SEP}`),
      )
      .map((key) =>
        key.slice(
          BrowserStorage.DOCUMENT_KEY.length + BrowserStorage.SEP.length,
        ),
      );

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
      documents = new Set(documentKeys);
    }

    // apply document id filter
    documents = documentIds ? documentIds.intersection(documents) : documents;

    for (const documentId of documents) {
      const document = await this.get(documentId).catch(() => null);
      // might be a child that has not been synced yet
      if (!document) continue;

      // apply document type filter
      if (documentTypes && !documentTypes.has(document.header.documentType))
        continue;

      // For each operation scope in the document
      for (const [scope] of Object.entries(document.state)) {
        // apply scope filter
        if (scopes && !scopes.has(scope)) continue;

        // Create storage unit for this document+scope combination
        storageUnits.push({
          documentId,
          documentModelType: document.header.documentType,
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
    const slugManifest = await this.getSlugManifest();

    if (signal?.aborted) {
      throw new AbortError("Aborted");
    }

    const slugs: string[] = [];
    for (const id of ids) {
      let found = false;
      for (const [slug, documentId] of Object.entries(slugManifest.slugToId)) {
        if (documentId === id) {
          slugs.push(slug);
          found = true;
          break;
        }
      }

      if (!found) {
        throw new DocumentNotFoundError(id);
      }
    }

    return Promise.resolve(slugs);
  }

  ////////////////////////////////
  // IDocumentAdminStorage
  ////////////////////////////////

  async clear() {
    const db = await this.db;
    await db.clear();
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

  async create(document: PHDocument): Promise<void> {
    const documentId = document.header.id;
    if (!isValidDocumentId(documentId)) {
      throw new DocumentIdValidationError(documentId);
    }

    const db = await this.db;

    if (await this.exists(documentId)) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    const slug =
      document.header.slug && document.header.slug.length > 0
        ? document.header.slug
        : documentId;
    if (!isValidSlug(slug)) {
      throw new DocumentSlugValidationError(slug);
    }

    // check if the slug is already taken
    const slugManifest = await this.getSlugManifest();
    if (slugManifest.slugToId[slug]) {
      throw new DocumentAlreadyExistsError(
        documentId,
        DocumentAlreadyExistsReason.SLUG,
      );
    }

    document.header.slug = slug;
    await db.setItem(this.buildDocumentKey(documentId), document);

    // Update the slug manifest if the document has a slug
    if (slug) {
      const slugManifest = await this.getSlugManifest();

      // check if the slug is already taken
      if (slugManifest.slugToId[slug]) {
        throw new Error(`Document with slug ${slug} already exists`);
      }

      slugManifest.slugToId[slug] = documentId;
      await this.updateSlugManifest(slugManifest);
    }

    // temporary: initialize an empty manifest for new drives
    if (document.header.documentType === "powerhouse/document-drive") {
      this.updateDriveManifest(documentId, { documentIds: [] });
    }
  }

  async get<TDocument extends PHDocument>(
    documentId: string,
  ): Promise<TDocument> {
    const db = await this.db;
    const document = await db.getItem<TDocument>(
      this.buildDocumentKey(documentId),
    );

    if (!document) {
      return Promise.reject(new DocumentNotFoundError(documentId));
    }

    return document;
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
    const db = await this.db;
    const keys = await db.keys();

    const documentKeys = keys.filter((key) =>
      key.startsWith(`${BrowserStorage.DOCUMENT_KEY}${BrowserStorage.SEP}`),
    );

    // Load documents with matching type and collect their metadata
    const documentsAndIds: Array<{ id: string; document: PHDocument }> = [];
    for (const key of documentKeys) {
      const documentId = key.slice(
        BrowserStorage.DOCUMENT_KEY.length + BrowserStorage.SEP.length,
      );

      try {
        const document = await db.getItem<PHDocument>(key);
        if (!document || document.header.documentType !== documentModelType) {
          continue;
        }

        documentsAndIds.push({ id: documentId, document });
      } catch (error) {
        continue;
      }
    }

    // Sort by creation date, then by ID
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
    const db = await this.db;

    const document = await db.getItem<PHDocument>(
      this.buildDocumentKey(documentId),
    );

    if (!document) {
      return false;
    }

    // Remove from slug manifest if it has a slug
    const slug =
      document.header.slug?.length > 0 ? document.header.slug : documentId;
    try {
      if (slug) {
        const slugManifest = await this.getSlugManifest();
        if (slugManifest.slugToId[slug] === documentId) {
          delete slugManifest.slugToId[slug];
          await this.updateSlugManifest(slugManifest);
        }
      }
    } catch (error) {
      // If we can't get the slug, we can't remove it from the manifest
    }

    // remove from parent manifests
    const parents = await this.getParents(documentId);
    for (const parent of parents) {
      await this.removeChild(parent, documentId);
    }

    // delete any manifest for this document
    await db.removeItem(this.buildManifestKey(documentId));

    // finally, delete the specified document
    await db.removeItem(this.buildDocumentKey(documentId));

    return true;
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

  async addChild(parentId: string, childId: string): Promise<void> {
    if (parentId === childId) {
      throw new Error("Cannot associate a document with itself");
    }

    // check if the child is a parent of the parent
    const children = await this.getChildren(childId);
    if (children.includes(parentId)) {
      throw new Error("Cannot associate a document with its child");
    }

    const manifest = await this.getManifest(parentId);
    if (!manifest.documentIds.includes(childId)) {
      manifest.documentIds.push(childId);
      await this.updateDriveManifest(parentId, manifest);
    }
  }

  async getChildren(parentId: string): Promise<string[]> {
    const manifest = await this.getManifest(parentId);
    return manifest.documentIds;
  }

  async getParents(childId: string): Promise<string[]> {
    const db = await this.db;
    const keys = await db.keys();
    const parents: string[] = [];

    // Find all manifest keys
    const manifestKeys = keys.filter((key) =>
      key.startsWith(`${BrowserStorage.MANIFEST_KEY}${BrowserStorage.SEP}`),
    );

    // Check each manifest to see if it contains the childId
    for (const key of manifestKeys) {
      // Extract the driveId from the manifest key
      const driveId = key.slice(
        BrowserStorage.MANIFEST_KEY.length + BrowserStorage.SEP.length,
      );

      const manifest = await this.getManifest(driveId);
      if (manifest.documentIds.includes(childId)) {
        parents.push(driveId);
      }
    }

    return parents;
  }

  ////////////////////////////////
  // IDriveStorage
  ////////////////////////////////

  private async getManifest(driveId: string): Promise<DriveManifest> {
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

  private async getSlugManifest(): Promise<SlugManifest> {
    const db = await this.db;
    const manifest = await db.getItem<SlugManifest>(
      BrowserStorage.SLUG_MANIFEST_KEY,
    );
    return manifest || { slugToId: {} };
  }

  private async updateSlugManifest(manifest: SlugManifest): Promise<void> {
    const db = await this.db;
    await db.setItem(BrowserStorage.SLUG_MANIFEST_KEY, manifest);
  }

  async addDocumentOperations(
    id: string,
    operations: Operation[],
    document: PHDocument,
  ): Promise<void> {
    const existingDocument = await this.get(id);
    if (!existingDocument) {
      throw new Error(`Document with id ${id} not found`);
    }

    const mergedOperations = mergeOperations(
      existingDocument.operations,
      operations,
    );

    const db = await this.db;
    await db.setItem(this.buildDocumentKey(id), {
      ...existingDocument,
      ...document,
      operations: mergedOperations,
    });
  }

  async addDriveOperations(
    id: string,
    operations: Operation[],
    document: PHDocument,
  ): Promise<void> {
    const existingDocument = await this.get<DocumentDriveDocument>(id);
    const mergedOperations = mergeOperations(
      existingDocument.operations,
      operations,
    );
    const db = await this.db;

    await db.setItem(this.buildDocumentKey(id), {
      ...existingDocument,
      ...document,
      operations: mergedOperations,
    });
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
          if (!document?.operations[unit.scope]) {
            return undefined;
          }
          const operations = document.operations[unit.scope];

          return {
            documentId: unit.documentId,
            documentType: unit.documentType,
            scope: unit.scope,
            branch: unit.branch,
            lastUpdated:
              operations.at(-1)?.timestampUtcMs ??
              document.header.createdAtUtcIso,
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

  // migrates all stored operations from legacy signature to signatures array
  async migrateOperationSignatures() {
    let cursor: string | undefined;
    do {
      const { documents: drives, nextCursor } = await this.findByType(
        "powerhouse/document-drive",
        100,
        cursor,
      );
      for (const drive of drives) {
        await this.migrateDrive(drive);

        const documents = await this.getChildren(drive);
        await Promise.all(
          documents.map(async (docId) => this.migrateDocument(drive, docId)),
        );
      }

      cursor = nextCursor;
    } while (cursor);
  }

  private async migrateDrive(driveId: string) {
    const drive = await this.get<DocumentDriveDocument>(driveId);
    const migratedDrive = migrateDocumentOperationSignatures(drive);
    if (migratedDrive !== drive) {
      return (await this.db).setItem(
        this.buildDocumentKey(driveId),
        migratedDrive,
      );
    }
  }

  private async migrateDocument(drive: string, id: string) {
    const document = await this.get(id);
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
