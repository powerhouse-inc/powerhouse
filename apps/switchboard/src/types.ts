import type { IConnectCrypto } from "@renown/sdk";
import type { DriveInput, IDocumentDriveServer } from "document-drive";

export type StorageOptions = {
  type: "filesystem" | "memory" | "postgres" | "browser";
  filesystemPath?: string;
  postgresUrl?: string;
};

export type IdentityOptions = {
  /** Path to the keypair file. Defaults to ~/.ph/keypair.json */
  keypairPath?: string;
  /**
   * If true, won't start without an existing keypair.
   * Use this to ensure the switchboard only runs with an authenticated identity.
   */
  requireExisting?: boolean;
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
  /**
   * Identity options for ConnectCrypto.
   * When configured, the switchboard will load the keypair from `ph login`
   * and can authenticate with remote services on behalf of the user.
   */
  identity?: IdentityOptions;
  mcp?: boolean;
  processorConfig?: Map<string, unknown>;
  disableLocalPackages?: boolean;
  reactorOptions?: {
    enableDualActionCreate?: boolean;
  };
  enableDocumentModelSubgraphs?: boolean;
};

export type SwitchboardReactor = {
  defaultDriveUrl: string | undefined;
  reactor: IDocumentDriveServer;
  /** The ConnectCrypto instance if identity was initialized */
  connectCrypto: IConnectCrypto | null;
};
