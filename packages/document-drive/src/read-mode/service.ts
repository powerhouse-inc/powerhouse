import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { driveDocumentModelModule } from "#drive-document-model/module";
import { DocumentModelNotFoundError } from "#server/error";
import {
  type DocumentGraphQLResult,
  fetchDocument,
  requestPublicDrive,
} from "#utils/graphql";
import type { DocumentModelModule, PHDocument } from "document-model";
import { type GraphQLError } from "graphql";
import { driveDocumentType } from "../drive-document-model/constants.js";
import {
  ReadDocumentNotFoundError,
  ReadDriveError,
  ReadDriveNotFoundError,
  ReadDriveSlugNotFoundError,
} from "./errors.js";
import {
  type GetDocumentModelModule,
  type IReadModeDriveService,
  type ReadDrive,
  type ReadDriveContext,
  type ReadDriveOptions,
} from "./types.js";

export class ReadModeService implements IReadModeDriveService {
  #getDocumentModelModule: GetDocumentModelModule;
  #drives = new Map<
    string,
    { drive: Omit<ReadDrive, "readContext">; context: ReadDriveContext }
  >();

  constructor(getDocumentModelModule: GetDocumentModelModule) {
    this.#getDocumentModelModule = getDocumentModelModule;
  }

  #parseGraphQLErrors(
    errors: GraphQLError[],
    driveId: string,
    documentId?: string,
  ) {
    for (const error of errors) {
      if (error.message === `Drive with id ${driveId} not found`) {
        return new ReadDriveNotFoundError(driveId);
      } else if (
        documentId &&
        error.message === `Document with id ${documentId} not found`
      ) {
        return new ReadDocumentNotFoundError(driveId, documentId);
      }
    }
    const firstError = errors.at(0);
    if (firstError) {
      return firstError;
    }
  }

  async #fetchDrive(id: string, url: string) {
    const { errors, document } = await fetchDocument(
      url,
      id,
      driveDocumentModelModule,
    );
    const error = errors ? this.#parseGraphQLErrors(errors, id) : undefined;
    return error || document;
  }

  async fetchDrive(id: string): Promise<ReadDrive | ReadDriveNotFoundError> {
    const drive = this.#drives.get(id);
    if (!drive) {
      return new ReadDriveNotFoundError(id);
    }
    const document = await this.fetchDocument<DocumentDriveDocument>(
      id,
      id,
      driveDocumentType,
    );
    if (document instanceof Error) {
      return document;
    }
    const result = { ...document, readContext: drive.context };
    drive.drive = result;
    return result;
  }

  async fetchDocument<TDocument extends PHDocument>(
    driveId: string,
    documentId: string,
    documentType: string,
  ): Promise<
    | DocumentGraphQLResult<TDocument>
    | DocumentModelNotFoundError
    | ReadDriveNotFoundError
    | ReadDocumentNotFoundError
  > {
    const drive = this.#drives.get(driveId);
    if (!drive) {
      return new ReadDriveNotFoundError(driveId);
    }

    let documentModelModule: DocumentModelModule | undefined = undefined;
    try {
      documentModelModule = this.#getDocumentModelModule(documentType);
    } catch (error) {
      return new DocumentModelNotFoundError(documentType, error);
    }

    const { url } = drive.context;
    const { errors, document } = await fetchDocument<TDocument>(
      url,
      documentId,
      documentModelModule,
    );

    if (errors) {
      const error = this.#parseGraphQLErrors(errors, driveId, documentId);
      if (error instanceof ReadDriveError) {
        return error;
      } else if (error) {
        throw error;
      }
    }

    if (!document) {
      return new ReadDocumentNotFoundError(driveId, documentId);
    }

    return document;
  }

  async addReadDrive(url: string, options?: ReadDriveOptions): Promise<void> {
    let id: string;
    if (options?.expectedDriveInfo) {
      id = options.expectedDriveInfo.id;
    } else {
      const drive = await requestPublicDrive(url);
      id = drive.id;
    }

    const result = await this.#fetchDrive(id, url);
    if (result instanceof Error) {
      throw result;
    } else if (!result) {
      throw new ReadDriveNotFoundError(id);
    }
    this.#drives.set(id, {
      drive: result,
      context: {
        ...options,
        url,
      },
    });
  }

  async getReadDrives() {
    return Promise.resolve([...this.#drives.keys()]);
  }

  async getReadDrive(id: string): Promise<ReadDrive | ReadDriveNotFoundError> {
    const result = this.#drives.get(id);
    return Promise.resolve(
      result
        ? { ...result.drive, readContext: result.context }
        : new ReadDriveNotFoundError(id),
    );
  }

  async getReadDriveBySlug(
    slug: string,
  ): Promise<ReadDrive | ReadDriveSlugNotFoundError> {
    const readDrive = [...this.#drives.values()].find(
      ({ drive }) => drive.header.slug === slug,
    );

    return Promise.resolve(
      readDrive
        ? { ...readDrive.drive, readContext: readDrive.context }
        : new ReadDriveSlugNotFoundError(slug),
    );
  }

  getReadDriveContext(id: string) {
    return Promise.resolve(
      this.#drives.get(id)?.context ?? new ReadDriveNotFoundError(id),
    );
  }

  deleteReadDrive(id: string): Promise<ReadDriveNotFoundError | undefined> {
    const deleted = this.#drives.delete(id);
    return Promise.resolve(
      deleted ? undefined : new ReadDriveNotFoundError(id),
    );
  }
}
