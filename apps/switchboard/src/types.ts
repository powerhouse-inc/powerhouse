import type { MeterProvider } from "@opentelemetry/api";
import type { IReactorClient } from "@powerhousedao/reactor";
import type { IRenown } from "@renown/sdk";
import type { DriveInput, IDocumentDriveServer } from "document-drive";
import type { ILogger } from "document-model";

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
   * When true, enables dynamic loading of document models from the registry
   * when an unknown document type is encountered during sync.
   * Disabled by default — enable with DYNAMIC_MODEL_LOADING=true env var.
   */
  dynamicModelLoading?: boolean;
  logger?: ILogger;
  /**
   * OpenTelemetry MeterProvider to register as the global provider before
   * ReactorInstrumentation starts. Must be provided here rather than set
   * externally to guarantee the registration happens before
   * instrumentation.start() reads the global provider via metrics.getMeter().
   */
  meterProvider?: MeterProvider;
};

export type SwitchboardReactor = {
  defaultDriveUrl: string | undefined;
  reactor: IReactorClient;
  legacyReactor: IDocumentDriveServer;
  /** The Renown instance if identity was initialized */
  renown: IRenown | null;
};
