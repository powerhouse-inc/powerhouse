import type { IReactorClient } from "@powerhousedao/reactor";
import type { IRenown } from "@renown/sdk";
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

  /** Base url of the Renown instance to use */
  baseUrl?: string;
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
   * Identity options for Renown.
   * When configured, the switchboard will load the keypair from `ph login`
   * and can authenticate with remote services on behalf of the user.
   */
  identity?: IdentityOptions;
  mcp?: boolean;
  processorConfig?: Map<string, unknown>;
  disableLocalPackages?: boolean;
  reactorOptions?: {
    /**
     * When true, both legacy and new reactors will use CREATE/UPDATE operation
     * flow for new documents.
     */
    enableDualActionCreate?: boolean;

    /**
     * When true, the new Reactor uses only the new Kysely-based storage
     * instead of the legacy document-drive storage.
     */
    storageV2?: boolean;
  };
  enableDocumentModelSubgraphs?: boolean;
  /**
   * When true, uses the new DocumentModelSubgraph class that uses reactorClient.
   * When false (default), uses the legacy DocumentModelSubgraphLegacy class.
   */
  useNewDocumentModelSubgraph?: boolean;
};

export type SwitchboardReactor = {
  defaultDriveUrl: string | undefined;
  reactor: IReactorClient;
  legacyReactor: IDocumentDriveServer;
  /** The Renown instance if identity was initialized */
  renown: IRenown | null;
};
