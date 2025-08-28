import type { LogLevel } from "@powerhousedao/config";
import type {
  DefaultRemoteDriveInfo,
  DocumentDriveLocalState,
  DriveEvents,
  FileNode,
  FolderNode,
  RemoteDriveAccessLevel,
} from "document-drive";
import type {
  GlobalStateFromDocument,
  Operation,
  PHDocument,
  PHDocumentHeader,
} from "document-model";
import type { GraphQLError } from "graphql";
export type GraphQLResult<T> = { [K in keyof T]: T[K] | null } & {
  errors?: GraphQLError[];
};

export type DriveInfo = {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  meta?: {
    preferredEditor?: string;
  };
};

export type DriveState = DriveInfo &
  Pick<DocumentDriveLocalState, "availableOffline" | "sharingType"> & {
    nodes: Array<FolderNode | Omit<FileNode, "synchronizationUnits">>;
  };

export type DocumentGraphQLResult<TDocument extends PHDocument> = TDocument & {
  revision: number;
  state: GlobalStateFromDocument<TDocument>;
  initialState: GlobalStateFromDocument<TDocument>;
  operations: (Operation & {
    inputText: string;
  })[];
};

export type ILogger = Pick<
  Console,
  "log" | "info" | "warn" | "error" | "debug"
> & {
  level: LogLevel | "env";
  errorHandler: LoggerErrorHandler | undefined;

  verbose: (message?: any, ...optionalParams: any[]) => void;
};

export type LoggerErrorHandler = (...data: any[]) => void;

export type PHDocumentGQL = Omit<PHDocumentHeader, "revision"> & {
  id: string;
  revision: number;
  // @deprecated
  createdAt: string;
  // @deprecated
  lastModified: string;
  __typename: string;
  state: unknown;
  initialState: unknown;
  stateJSON: unknown;
  operations: Operation[];
};

export interface IServerDelegateDrivesManager {
  emit: (...args: Parameters<DriveEvents["defaultRemoteDrive"]>) => void;
  detachDrive: (driveId: string) => Promise<void>;
}

export interface IDefaultDrivesManager {
  initializeDefaultRemoteDrives(): Promise<void>;
  getDefaultRemoteDrives(): Map<string, DefaultRemoteDriveInfo>;
  setDefaultDriveAccessLevel(
    url: string,
    level: RemoteDriveAccessLevel,
  ): Promise<void>;
  setAllDefaultDrivesAccessLevel(level: RemoteDriveAccessLevel): Promise<void>;
}
