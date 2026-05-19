import type {
  IReactorClient,
  ReactorClientModule,
} from "@powerhousedao/reactor";
import type { IRenown } from "@renown/sdk";
import type { DriveInput } from "@powerhousedao/shared/document-drive";
import type { ILogger } from "document-model";

/**
 * Drive container document type chosen for the boot-time default drive. The
 * legacy `powerhouse/document-drive` keeps the existing behavior; the newer
 * `powerhouse/reactor-drive` is wired through `addDefaultReactorDrive` and
 * uses the relationship-based child graph.
 */
export type SwitchboardDriveDocumentType =
  | "powerhouse/document-drive"
  | "powerhouse/reactor-drive";

/** A {@link DriveInput} extended with the optional drive-container type. */
export type SwitchboardDriveInput = DriveInput & {
  documentType?: SwitchboardDriveDocumentType;
};

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

  /** If true, unsigned actions will be rejected */
  requireSignatures?: boolean;
};

export type StartServerOptions = {
  /**
   * Pre-built ReactorClientModule (typically from
   * `@powerhousedao/reactor#ReactorClientBuilder.buildModule`). When set, the
   * switchboard reuses the caller's reactor instead of building its own,
   * and the caller owns the reactor's lifecycle. The API, GraphQL manager,
   * MCP, attachments, package management subgraph, and registry HTTP loader
   * are still configured around it.
   */
  reactor?: ReactorClientModule;
  /**
   * Registry URL for the HttpPackageLoader. Enables `PackagesSubgraph`
   * (install/uninstall mutations) plus dynamic package resolution.
   * Falls back to PH_REGISTRY_URL env, then `packageRegistryUrl` in the
   * powerhouse config file.
   */
  registryUrl?: string;
  configFile?: string;
  port?: number;
  /**
   * If true, fail immediately when the requested port is in use instead of
   * falling back to the next free port. Matches the semantics of Vite's
   * `--strictPort` flag that flows through the `ph vetra` command.
   */
  strictPort?: boolean;
  dev?: boolean;
  dbPath?: string;
  drive?: SwitchboardDriveInput;
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
  /**
   * When true, enables dynamic loading of document models from the registry
   * when an unknown document type is encountered during sync.
   * Disabled by default — enable with DYNAMIC_MODEL_LOADING=true env var.
   */
  dynamicModelLoading?: boolean;
  logger?: ILogger;
  /**
   * When true, on startup any local PGLite data dirs whose `PG_VERSION` is
   * older than the bundled PGLite are migrated to the current version
   * (backup → dump → restore) before the server boots. When false, the
   * server logs a warning and runs against the legacy data using the
   * matching legacy PGLite module.
   *
   * Triggered by the `--migrate-pglite` CLI flag or `PH_MIGRATE_PGLITE=true`.
   */
  migratePglite?: boolean;
  /**
   * Force a specific PGLite-embedded PG major (16 or 17) on startup.
   *
   * **Destructive**: any existing local PGLite data dirs are wiped before
   * the chosen PGLite re-`initdb`'s them at the requested version. Postgres
   * URLs are unaffected. Takes precedence over `migratePglite`.
   *
   * Triggered by `PH_FORCE_PG_VERSION=16|17`.
   */
  forcePgVersion?: 16 | 17;
};

export type SwitchboardReactor = {
  defaultDriveUrl: string | undefined;
  reactor: IReactorClient;
  /** The Renown instance if identity was initialized */
  renown: IRenown | null;
  /**
   * Port the HTTP server actually bound to. May differ from the requested
   * port when the requested port was in use and fallback kicked in.
   */
  port: number;
  /**
   * Tear down the HTTP server, GraphQL manager, attachments, MCP, and (when
   * the switchboard built it) the reactor itself. When a caller-provided
   * `reactor` was passed to `startSwitchboard`, the caller owns the reactor
   * lifecycle and this method only tears down what the switchboard added.
   */
  shutdown: () => Promise<void>;
};
