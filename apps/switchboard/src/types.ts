import { type DriveInput, type IDocumentDriveServer } from "document-drive";

export type StorageOptions = {
  type: "filesystem" | "memory" | "postgres" | "browser";
  filesystemPath?: string;
  postgresUrl?: string;
};

export type StartServerOptions = {
  configFile?: string;
  port?: number;
  dev?: boolean;
  dbPath?: string;
  drive?: DriveInput;
  packages?: string[];
  https?:
    | {
        keyPath: string;
        certPath: string;
      }
    | boolean
    | undefined;
  auth?: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
  };
};

export type SwitchboardReactor = {
  defaultDriveUrl: string | undefined;
  reactor: IDocumentDriveServer;
};
