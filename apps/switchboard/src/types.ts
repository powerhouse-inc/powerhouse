import type { DriveInput, IDocumentDriveServer } from "document-drive";

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
  remoteDrives?: string[];
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
  mcp?: boolean;
  processorConfig?: Map<string, unknown>;
  disableLocalPackages?: boolean;
  subgraphs?: {
    isReactorv2Enabled?: boolean;
  };
  reactorOptions?: {
    enableDualActionCreate?: boolean;
  };
};

export type SwitchboardReactor = {
  defaultDriveUrl: string | undefined;
  reactor: IDocumentDriveServer;
};
