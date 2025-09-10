import type { DocumentDriveDocument } from "#drive-document-model/gen/types";
import {
  DocumentAlreadyExistsError,
  DocumentAlreadyExistsReason,
  DocumentIdValidationError,
  DocumentNotFoundError,
  DocumentSlugValidationError,
} from "#server/error";
import type { SynchronizationUnitQuery } from "#server/types";
import { AbortError } from "#utils/errors";
import { mergeOperations, operationsToRevision } from "#utils/misc";
import type { Operation, PHDocument } from "document-model";
import type {
  IDocumentAdminStorage,
  IDocumentStorage,
  IDriveOperationStorage,
  IStorageUnit,
  IStorageUnitFilter,
} from "./types.js";
import {
  isValidDocumentId,
  isValidSlug,
  resolveStorageUnitsFilter,
} from "./utils.js";

type DriveManifest = {
  documentIds: Set<string>;
};

export class MemoryStorage
  implements IDriveOperationStorage, IDocumentStorage, IDocumentAdminStorage
{
  private documents: Record<string, PHDocument>;
  private driveManifests: Record<string, DriveManifest>;
  private slugToDocumentId: Record<string, string>;

  constructor() {
    this.documents = {};
    this.driveManifests = {};
    this.slugToDocumentId = {};
  }

  ////////////////////////////////
  // IDocumentView
  ////////////////////////////////
  resolveIds(slugs: string[], signal?: AbortSignal): Promise<string[]> {
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

  resolveSlugs(ids: string[], signal?: AbortSignal): Promise<string[]> {
    const slugs = [];
    for (const id of ids) {
      const document = this.documents[id];
      if (!document) {
        throw new DocumentNotFoundError(id);
      }

      slugs.push(document.header.slug);
    }

    if (signal?.aborted) {
      throw new AbortError("Aborted");
    }

    return Promise.resolve(slugs);
  }

  ////////////////////////////////
  // IDocumentStorage
  ////////////////////////////////

  exists(documentId: string): Promise<boolean> {
    return Promise.resolve(!!this.documents[documentId]);
  }

  create(document: PHDocument) {
    const documentId = document.header.id;
    if (!isValidDocumentId(documentId)) {
      throw new DocumentIdValidationError(documentId);
    }

    // check if the document already exists by id
    if (this.documents[documentId]) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    const slug =
      document.header.slug?.length > 0 ? document.header.slug : documentId;
    if (!isValidSlug(slug)) {
      throw new DocumentSlugValidationError(slug);
    }

    // check if the document already exists by slug
    if (slug && this.slugToDocumentId[slug]) {
      throw new DocumentAlreadyExistsError(
        documentId,
        DocumentAlreadyExistsReason.SLUG,
      );
    }

    // store the document and update the slug
    document.header.slug = slug;
    this.documents[documentId] = document;

    // add slug to lookup if it exists
    if (slug) {
      // check if the slug is already taken
      if (this.slugToDocumentId[slug]) {
        throw new DocumentAlreadyExistsError(
          documentId,
          DocumentAlreadyExistsReason.SLUG,
        );
      }

      this.slugToDocumentId[slug] = documentId;
    }

    // temporary: initialize an empty manifest for new drives
    if (document.header.documentType === "powerhouse/document-drive") {
      this.updateDriveManifest(documentId, { documentIds: new Set() });
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

  async findByType(
    documentModelType: string,
    limit = 100,
    cursor?: string,
  ): Promise<{
    documents: string[];
    nextCursor: string | undefined;
  }> {
    const documentsAndIds = Object.entries(this.documents)
      .filter(([_, doc]) => doc.header.documentType === documentModelType)
      .map(([id, doc]) => ({
        id,
        document: doc,
      }));

    // sort: created first, then id -- similar to prisma's ordinal but not guaranteed
    documentsAndIds.sort((a, b) => {
      // get date objects
      const aDate = new Date(a.document.header.createdAtUtcIso);
      const bDate = new Date(b.document.header.createdAtUtcIso);

      // if the dates are the same, sort by id
      if (aDate.getTime() === bDate.getTime()) {
        const aId = a.id;
        const bId = b.id;

        return aId.localeCompare(bId);
      }

      return aDate.getTime() - bDate.getTime();
    });

    // if cursor is provided, start there
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

    // return the documents
    return {
      documents: documentsAndIds
        .slice(startIndex, endIndex)
        .map(({ id }) => id),
      nextCursor,
    };
  }

  async delete(documentId: string): Promise<boolean> {
    // Remove from slug lookup if it has a slug
    const document = this.documents[documentId];
    if (document) {
      const slug =
        document.header.slug?.length > 0 ? document.header.slug : documentId;
      if (slug && this.slugToDocumentId[slug] === documentId) {
        delete this.slugToDocumentId[slug];
      }
    }

    // remove from parent manifests
    const parents = await this.getParents(documentId);
    for (const parent of parents) {
      await this.removeChild(parent, documentId);
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

  async getParents(childId: string): Promise<string[]> {
    const parents: string[] = [];

    // Scan through all drive manifests to find ones that contain the childId
    for (const [driveId, manifest] of Object.entries(this.driveManifests)) {
      if (manifest.documentIds.has(childId)) {
        parents.push(driveId);
      }
    }

    return parents;
  }

  ////////////////////////////////
  // IDocumentAdminStorage
  ////////////////////////////////

  async clear(): Promise<void> {
    this.documents = {};
    this.driveManifests = {};
    this.slugToDocumentId = {};
  }

  ////////////////////////////////
  // IDriveStorage
  ////////////////////////////////

  async addDocumentOperations(
    id: string,
    operations: Operation[],
    document: PHDocument,
  ): Promise<void> {
    const existingDocument = await this.get(id);
    if (!document) {
      return Promise.reject(new DocumentNotFoundError(id));
    }

    const mergedOperations = mergeOperations(
      existingDocument.operations,
      operations,
    );

    this.documents[id] = {
      ...existingDocument,
      ...document,
      operations: mergedOperations,
    };
  }

  async addDriveOperations(
    id: string,
    operations: Operation[],
    document: PHDocument,
  ): Promise<void> {
    const drive = await this.get<DocumentDriveDocument>(id);
    const mergedOperations = mergeOperations(drive.operations, operations);

    this.documents[id] = {
      ...drive,
      ...document,
      operations: mergedOperations,
    };
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
          if (!document || !Object.keys(document.state).includes(unit.scope)) {
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
      documents = new Set(Object.keys(this.documents));
    }

    // apply document id filter
    documents = documentIds ? documentIds.intersection(documents) : documents;

    for (const documentId of documents) {
      const document = this.documents[documentId];
      // might be a child that has not been synced yet
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
