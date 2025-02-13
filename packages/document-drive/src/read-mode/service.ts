import type { Action, DocumentModelModule } from "document-model";
import { GraphQLError } from "graphql";
import { driveDocumentType } from "../drive-document-model/constants.js";
import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "../drive-document-model/gen/types.js";
import { driveDocumentModelModule } from "../drive-document-model/module.js";
import { DocumentModelNotFoundError } from "../server/error.js";
import {
  DocumentGraphQLResult,
  fetchDocument,
  requestPublicDrive,
} from "../utils/graphql.js";
import {
  ReadDocumentNotFoundError,
  ReadDriveError,
  ReadDriveNotFoundError,
  ReadDriveSlugNotFoundError,
} from "./errors.js";
import {
  GetDocumentModel,
  IReadModeDriveService,
  ReadDrive,
  ReadDriveContext,
  ReadDriveOptions,
} from "./types.js";

export class ReadModeService implements IReadModeDriveService {
  #getDocumentModel: GetDocumentModel;
  #drives = new Map<
    string,
    { drive: Omit<ReadDrive, "readContext">; context: ReadDriveContext }
  >();

  constructor(getDocumentModel: GetDocumentModel) {
    this.#getDocumentModel = getDocumentModel;
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
    const document = await this.fetchDocument<
      DocumentDriveState,
      DocumentDriveLocalState,
      DocumentDriveAction
    >(id, id, driveDocumentType);
    if (document instanceof Error) {
      return document;
    }
    const result = { ...document, readContext: drive.context };
    drive.drive = result;
    return result;
  }

  async fetchDocument<TGlobalState, TLocalState, TAction extends Action>(
    driveId: string,
    documentId: string,
    documentType: string,
  ): Promise<
    | DocumentGraphQLResult<TGlobalState, TLocalState>
    | DocumentModelNotFoundError
    | ReadDriveNotFoundError
    | ReadDocumentNotFoundError
  > {
    const drive = this.#drives.get(driveId);
    if (!drive) {
      return new ReadDriveNotFoundError(driveId);
    }

    let documentModelModule:
      | DocumentModelModule<TGlobalState, TLocalState, TAction>
      | undefined = undefined;
    try {
      documentModelModule = this.#getDocumentModel(documentType);
    } catch (error) {
      return new DocumentModelNotFoundError(documentType, error);
    }

    const { url } = drive.context;
    const { errors, document } = await fetchDocument<
      TGlobalState,
      TLocalState,
      TAction
    >(url, documentId, documentModelModule);

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
    const { id } =
      options?.expectedDriveInfo ?? (await requestPublicDrive(url));

    const result = await this.#fetchDrive(id, url);
    if (result instanceof Error) {
      throw result;
    } else if (!result) {
      throw new Error(`Drive "${id}" not found at ${url}`);
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

  async getReadDrive(id: string) {
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
      ({ drive }) => drive.state.global.slug === slug,
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
