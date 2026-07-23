import type {
  InProcessReactorClientModule,
  IReactorClient,
} from "@powerhousedao/reactor";
import type { AttachmentReferenceProjectionCapability } from "@powerhousedao/reactor-api";
import type { IAttachmentService } from "@powerhousedao/reactor-attachments";
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
   *
   * Lifecycle contract: switchboard does NOT wire itself into the caller's
   * reactor shutdown. Callers must invoke `shutdown()` on the returned
   * `SwitchboardReactor` from their own teardown (and SIGINT handlers) to
   * drain `/graphql`, MCP, attachments, etc. Killing the caller's reactor
   * alone will not release these resources.
   *
   * Setup contract: the reactor must have switchboard's expected wiring
   * already applied — channel scheme, document models, signal handlers,
   * etc. Use `applySwitchboardReactorDefaults` from this module to apply
   * the same defaults switchboard uses internally; opt out of individual
   * pieces as needed.
   */
  reactor?: InProcessReactorClientModule;
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
  /**
   * Identity options for Renown.
   * When configured, the switchboard will load the keypair from `ph login`
   * and can authenticate with remote services on behalf of the user.
   */
  identity?: IdentityOptions;
  /** Base URL for the attachment service; defaults to `PH_SWITCHBOARD_PUBLIC_URL` then `http(s)://localhost:${port}`. */
  attachmentServiceUrl?: string;
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
  /**
   * Executor worker pool: `numWorkers > 0` runs jobs in N worker threads;
   * `"auto"` sizes the pool from the machine's available cores; 0 or unset
   * keeps the in-process executor (the default). Unset fields fall back to
   * the REACTOR_WORKERS / REACTOR_DB_* env vars. Requires a Postgres reactor
   * database; incompatible with `dev` mode (Vite-loaded models cannot cross
   * a thread boundary).
   */
  workerPool?: {
    numWorkers?: number | "auto";
    dbPoolSizePerWorker?: number;
    acquireTimeoutMs?: number;
  };
};

export type SwitchboardReactor = {
  defaultDriveUrl: string | undefined;
  reactor: IReactorClient;
  /** Switchboard-backed remote attachment service over its own `/attachments/*` API, for downstream consumers. */
  attachmentService: IAttachmentService;
  /** Whether the authoritative attachment-reference projection is active. */
  attachmentReferenceProjection: AttachmentReferenceProjectionCapability;
  /** The Renown instance if identity was initialized */
  renown: IRenown | null;
  /**
   * Port the HTTP server actually bound to. May differ from the requested
   * port when the requested port was in use and fallback kicked in.
   */
  port: number;
  /**
   * Drain switchboard-owned resources: HTTP server, GraphQL manager,
   * attachments, MCP, packages subgraph, and the read-model DB. This does
   * NOT kill the reactor — in owned-reactor mode the reactor lifecycle is
   * handled by its own SIGINT signal handlers, which then drain the api via
   * the shutdown hook switchboard registered on the builder. In
   * caller-provided mode the caller owns the reactor lifecycle separately.
   *
   * Callers using a caller-provided reactor must invoke this from their own
   * teardown / SIGINT path so api resources are released; killing the
   * reactor alone won't release them.
   */
  shutdown: () => Promise<void>;
};
