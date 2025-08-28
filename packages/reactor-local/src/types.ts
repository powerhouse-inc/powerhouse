import type { LogLevel } from "@powerhousedao/config";
import type {
  DefaultRemoteDriveInput,
  DriveInput,
  IDocumentDriveServer,
} from "document-drive";
import path from "node:path";

export type RemoteDriveInputSimple = string | DefaultRemoteDriveInput;

export type StorageOptions = {
  type: "filesystem" | "memory" | "postgres" | "browser";
  filesystemPath?: string;
  postgresUrl?: string;
};

export type StartServerOptions = {
  configFile?: string;
  dev?: boolean;
  port?: string | number;
  storage?: StorageOptions;
  dbPath?: string;
  drive?: DriveInput;
  disableDefaultDrive?: boolean;
  packages?: string[];
  https?:
    | {
        keyPath: string;
        certPath: string;
      }
    | boolean
    | undefined;
  logLevel?: LogLevel;
  remoteDrives?: RemoteDriveInputSimple[];
  mcp?: boolean;
};

export const DefaultStartServerOptions = {
  port: 4001,
  storage: {
    type: "filesystem",
    filesystemPath: path.join(process.cwd(), ".ph/file-storage"),
  },
  dbPath: path.join(process.cwd(), ".ph/read-model.db"),
  drive: {
    id: "powerhouse",
    slug: "powerhouse",
    global: {
      name: "Powerhouse",
      icon: "https://ipfs.io/ipfs/QmcaTDBYn8X2psGaXe7iQ6qd8q6oqHLgxvMX9yXf7f9uP7",
    },
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public",
      triggers: [],
    },
  },
  mcp: true,
} satisfies StartServerOptions;

export type LocalReactor = {
  driveUrl: string | null;
  getDocumentPath: (driveId: string, documentId: string) => string;
  server: IDocumentDriveServer;
};
