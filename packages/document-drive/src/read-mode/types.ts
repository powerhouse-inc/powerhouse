import { Action, BaseDocument, DocumentModelModule } from "document-model";
import {
  DocumentDriveDocument,
  ListenerFilter,
} from "../drive-document-model/gen/types.js";
import { DocumentModelNotFoundError } from "../server/error.js";
import {
  DocumentDriveServerMixin,
  RemoteDriveOptions,
} from "../server/types.js";
import { DriveInfo } from "../utils/graphql.js";
import {
  ReadDocumentNotFoundError,
  ReadDriveNotFoundError,
  ReadDriveSlugNotFoundError,
} from "./errors.js";

export type ReadModeDriveServerMixin =
  DocumentDriveServerMixin<IReadModeDriveServer>;

export type ReadDrivesListener = (
  drives: ReadDrive[],
  operation: "add" | "delete",
) => void;

export type ReadDrivesListenerUnsubscribe = () => void;

export interface IReadModeDriveServer extends IReadModeDriveService {
  migrateReadDrive(
    id: string,
    options: RemoteDriveOptions,
  ): Promise<DocumentDriveDocument | ReadDriveNotFoundError>;
  onReadDrivesUpdate(
    listener: ReadDrivesListener,
  ): Promise<ReadDrivesListenerUnsubscribe>; // TODO: make DriveEvents extensible and reuse event emitter
}

export type ReadDriveOptions = {
  expectedDriveInfo?: DriveInfo;
  filter?: ListenerFilter;
};

export type ReadDriveContext = {
  url: string;
} & ReadDriveOptions;

export type ReadDrive = DocumentDriveDocument & {
  readContext: ReadDriveContext;
};

export interface IReadModeDriveService {
  addReadDrive(url: string, options?: ReadDriveOptions): Promise<void>;

  getReadDrives(): Promise<string[]>;

  getReadDriveBySlug(
    slug: string,
  ): Promise<ReadDrive | ReadDriveSlugNotFoundError>;

  getReadDrive(id: string): Promise<ReadDrive | ReadDriveNotFoundError>;

  getReadDriveContext(
    id: string,
  ): Promise<ReadDriveContext | ReadDriveNotFoundError>;

  fetchDrive(id: string): Promise<ReadDrive | ReadDriveNotFoundError>;

  fetchDocument<TGlobalState, TLocalState>(
    driveId: string,
    documentId: string,
    documentType: string,
  ): Promise<
    | BaseDocument<TGlobalState, TLocalState>
    | DocumentModelNotFoundError
    | ReadDriveNotFoundError
    | ReadDocumentNotFoundError
  >;

  deleteReadDrive(id: string): Promise<ReadDriveNotFoundError | undefined>;
}

export type GetDocumentModel = <
  TGlobalState,
  TLocalState,
  TAction extends Action,
>(
  documentType: string,
) => DocumentModelModule<TGlobalState, TLocalState, TAction>;
