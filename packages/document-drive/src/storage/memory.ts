import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import {
  DocumentAlreadyExistsError,
  DocumentIdValidationError,
  DocumentNotFoundError,
  DocumentSlugValidationError,
} from "#server/error";
import { type SynchronizationUnitQuery } from "#server/types";
import { mergeOperations } from "#utils/misc";
import {
  type DocumentHeader,
  type Operation,
  type OperationFromDocument,
  type OperationScope,
  type PHDocument,
} from "document-model";
import {
  type IDocumentAdminStorage,
  type IDocumentStorage,
  type IDriveOperationStorage,
} from "./types.js";
import { isValidDocumentId, isValidSlug } from "./utils.js";

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
  // IDocumentStorage
  ////////////////////////////////

  exists(documentId: string): Promise<boolean> {
    return Promise.resolve(!!this.documents[documentId]);
  }

  create(document: PHDocument) {
    const documentId = document.id;
    if (!isValidDocumentId(documentId)) {
      throw new DocumentIdValidationError(documentId);
    }

    // check if the document already exists by id
    if (this.documents[documentId]) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    const slug = document.slug.length > 0 ? document.slug : documentId;
    if (!isValidSlug(slug)) {
      throw new DocumentSlugValidationError(slug);
    }

    // check if the document already exists by slug
    if (slug && this.slugToDocumentId[slug]) {
      throw new DocumentAlreadyExistsError(documentId);
    }

    // store the document and update the slug
    document.slug = slug;
    this.documents[documentId] = document;

    // add slug to lookup if it exists
    if (slug) {
      // check if the slug is already taken
      if (this.slugToDocumentId[slug]) {
        throw new DocumentAlreadyExistsError(documentId);
      }

      this.slugToDocumentId[slug] = documentId;
    }

    // temporary: initialize an empty manifest for new drives
    if (document.documentType === "powerhouse/document-drive") {
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
      .filter(([_, doc]) => doc.documentType === documentModelType)
      .map(([id, doc]) => ({
        id,
        document: doc,
      }));

    // sort: created first, then id -- similar to prisma's ordinal but not guaranteed
    documentsAndIds.sort((a, b) => {
      // get date objects
      const aDate = new Date(a.document.created);
      const bDate = new Date(b.document.created);

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
      const slug = document.slug.length > 0 ? document.slug : documentId;
      if (slug && this.slugToDocumentId[slug] === documentId) {
        delete this.slugToDocumentId[slug];
      }
    }

    // remove from parent manifests
    const parents = await this.getParents(documentId);
    for (const parent of parents) {
      await this.removeChild(parent, documentId);
    }

    // check children: any children that are only children of this document should be deleted
    const children = await this.getChildren(documentId);
    for (const child of children) {
      const childParents = await this.getParents(child);
      if (childParents.length === 1) {
        await this.delete(child);
      }
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
