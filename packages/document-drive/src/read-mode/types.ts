import type {
  DocumentDriveDocument,
  DocumentDriveServerMixin,
  DocumentModelNotFoundError,
  DriveInfo,
  ListenerFilter,
  ReadDocumentNotFoundError,
  ReadDriveNotFoundError,
  ReadDriveSlugNotFoundError,
  RemoteDriveOptions,
} from "document-drive";
import type {
  DocumentModelModule,
  PHBaseState,
  PHDocument,
} from "document-model";

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

  fetchDocument<TState extends PHBaseState = PHBaseState>(
    driveId: string,
    documentId: string,
    documentType: string,
  ): Promise<
    | PHDocument<TState>
    | DocumentModelNotFoundError
    | ReadDriveNotFoundError
    | ReadDocumentNotFoundError
  >;

  deleteReadDrive(id: string): Promise<ReadDriveNotFoundError | undefined>;
}

export type GetDocumentModelModule = (
  documentType: string,
) => DocumentModelModule<any>;
