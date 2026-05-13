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
 * Files don't carry their name here — it lives on the child document's header.
 */
export type DriveChildFileMetadata = {
  kind: "file";
  parentFolderId: string | null;
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
