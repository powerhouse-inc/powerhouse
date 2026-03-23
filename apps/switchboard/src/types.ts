import type { IReactorClient } from "@powerhousedao/reactor";
import type { IRenown } from "@renown/sdk";
import type { DriveInput, ILogger } from "document-drive";
import type { MeterProvider } from "@opentelemetry/api";

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
  enableDocumentModelSubgraphs?: boolean;
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
  /** The Renown instance if identity was initialized */
  renown: IRenown | null;
};
