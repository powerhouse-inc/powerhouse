import {
  DocumentDriveDocument,
  ListenerFilter,
} from "document-model-libs/document-drive";
import { Action, Document, DocumentModelModule } from "document-model/document";
import { DocumentDriveServerMixin, RemoteDriveOptions } from "../server";
import { DocumentModelNotFoundError } from "../server/error";
import { DriveInfo } from "../utils/graphql";
import {
  ReadDocumentNotFoundError,
  ReadDriveNotFoundError,
  ReadDriveSlugNotFoundError,
} from "./errors";

// TODO: move these types to the document-model package
export type InferDocumentState<D extends Document> =
  D extends Document<infer S> ? S : never;

export type InferDocumentOperation<D extends Document> =
  D extends Document<unknown, infer A> ? A : never;

export type InferDocumentLocalState<D extends Document> =
  D extends Document<unknown, Action, infer L> ? L : never;

export type InferDocumentGenerics<D extends Document> = {
  state: InferDocumentState<D>;
  action: InferDocumentOperation<D>;
  logger: InferDocumentLocalState<D>;
};

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

export type IsDocument<D extends Document> =
  (<G>() => G extends D ? 1 : 2) extends <G>() => G extends Document ? 1 : 2
    ? true
    : false;

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

  fetchDocument<D extends Document>(
    driveId: string,
    documentId: string,
    documentType: DocumentModelModule<
      InferDocumentState<D>,
      InferDocumentOperation<D>,
      InferDocumentLocalState<D>
    >["documentModel"]["id"],
  ): Promise<
    | Document<
        InferDocumentState<D>,
        InferDocumentOperation<D>,
        InferDocumentLocalState<D>
      >
    | DocumentModelNotFoundError
    | ReadDriveNotFoundError
    | ReadDocumentNotFoundError
  >;

  deleteReadDrive(id: string): Promise<ReadDriveNotFoundError | undefined>;
}

export type GetDocumentModel = (documentType: string) => DocumentModelModule;
