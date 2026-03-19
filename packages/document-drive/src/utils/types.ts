import type {
  DocumentDriveLocalState,
  FileNode,
  FolderNode,
} from "@powerhousedao/shared/document-drive";
import type {
  PHBaseState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { Operation, Pick } from "@prisma/client/runtime/library";
import type {
  DefaultRemoteDriveInfo,
  DriveEvents,
  RemoteDriveAccessLevel,
} from "document-drive";
import type { GraphQLError } from "graphql";

export type DriveState = DriveInfo &
  Pick<DocumentDriveLocalState, "availableOffline" | "sharingType"> & {
    nodes: Array<FolderNode | Omit<FileNode, "synchronizationUnits">>;
  };

export type DocumentGraphQLResult<TState extends PHBaseState = PHBaseState> =
  PHDocument<TState> & {
    revision: number;
    state: TState;
    initialState: TState;
    operations: (Operation & {
      inputText: string;
    })[];
  };

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

export type Task<T = void> = () => T;
export type AbortTask = () => void;
export type RunAsap<T> = (task: Task<T>) => AbortTask;
