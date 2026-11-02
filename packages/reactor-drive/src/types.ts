import type {
  DocumentModelModule,
  PHBaseState,
} from "@powerhousedao/shared/document-model";

export type ReactorDriveGlobalState = {
  name: string;
  icon: string | null;
};

export type ReactorDriveLocalState = {
  sharingType: string;
  availableOffline: boolean;
};

export type ReactorDrivePHState = PHBaseState & {
  global: ReactorDriveGlobalState;
  local: ReactorDriveLocalState;
};

export type ReactorDriveInput = {
  global: Partial<ReactorDriveGlobalState>;
  local?: Partial<ReactorDriveLocalState>;
  preferredEditor?: string;
};

export type ReactorDriveDocumentModelModule =
  DocumentModelModule<ReactorDrivePHState>;

/**
 * Metadata carried on the `drive/child` relationship for file children.
 * The parentFolderId is null when the file lives directly under the drive root.
 * A file's name lives on the child document's header; the optional name here
 * is the requested name for a link made before the projection knew the
 * document's name (a relink of existing documents), and a later SET_NAME
 * still replaces it.
 * documentType is duplicated here so the projection never depends on the order
 * in which CREATE_DOCUMENT and ADD_RELATIONSHIP arrive; documentType is
 * immutable after document creation, so the duplication is safe.
 */
export type DriveChildFileMetadata = {
  kind: "file";
  parentFolderId: string | null;
  documentType: string;
  name?: string;
};

export type AddFolderActionInput = {
  folderId: string;
  parentFolderId: string | null;
  name: string;
};

export type UpdateFolderActionInput = {
  folderId: string;
  name?: string;
  parentFolderId?: string | null;
};

export type RemoveFolderActionInput = {
  folderId: string;
};

export type ReactorDriveNodeKind = "file" | "folder";

export type ReactorDriveFileNode = {
  kind: "file";
  id: string;
  driveId: string;
  parentFolder: string | null;
  name: string;
  documentType: string;
};

export type ReactorDriveFolderNode = {
  kind: "folder";
  id: string;
  driveId: string;
  parentFolder: string | null;
  name: string;
};

export type ReactorDriveNode = ReactorDriveFileNode | ReactorDriveFolderNode;
