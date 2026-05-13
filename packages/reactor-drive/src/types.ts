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
 * Discriminated union carried on the `drive/child` relationship metadata.
 * Files don't carry their name on the relationship — their name lives on the
 * child document's header.
 */
export type DriveContainsMetadata =
  | { kind: "file" }
  | { kind: "folder"; name: string };

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
