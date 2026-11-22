/**
 * Types for the Powerhouse integration.
 *
 * All Powerhouse types are imported via `import type` — erased at runtime,
 * no peer-dep coupling at the module level. @powerhousedao/reactor is still
 * an optional peer for runtime, but types flow freely.
 */

import type {
  IReactorClient,
  DocumentChangeEvent,
  SearchFilter,
  ViewFilter,
  PagingOptions,
  PagedResults,
  JobInfo,
} from "@powerhousedao/reactor";

/**
 * Options for creating an empty document. Mirrors the internal
 * `CreateDocumentOptions` type in @powerhousedao/reactor (not exported there).
 */
interface CreateDocumentOptions {
  parentIdentifier?: string;
  documentModelVersion?: number;
}
import type {
  DocumentModelModule,
  PHDocument,
  Action,
  PHBaseState,
} from "document-model";
import type { WorkdirStore } from "../../core/types.js";
import type {
  IAttachmentService,
  AttachmentResponse,
  AttachmentUploadResult,
  ReserveAttachmentOptions,
  AttachmentHeader,
} from "@powerhousedao/reactor-attachments";
import type { AttachmentRef } from "@powerhousedao/reactor";
import type { BearerTokenProvider } from "@powerhousedao/reactor-browser/graphql-client";
import type { ISigner } from "@powerhousedao/shared/document-model";

export type {
  IAttachmentService,
  AttachmentRef,
  AttachmentResponse,
  AttachmentUploadResult,
  ReserveAttachmentOptions,
  AttachmentHeader,
};

// ── Registry ──────────────────────────────────────────────────────

/**
 * One entry in a DocumentRegistry. Carries enough to narrow every
 * IReactorClient method that touches a PHDocument or Action.
 *
 * - `document` — the concrete PHDocument shape returned by `get`, `create`, etc.
 * - `actions` — union of Action types accepted by `execute` / `executeAsync`.
 * - `state` — the global state shape, used by `DocumentModelModule<S>` introspection.
 */
export interface RegistryEntry<
  S extends PHBaseState = PHBaseState,
  A extends Action = Action,
> {
  document: PHDocument<S>;
  actions: A;
  state: S;
}

/**
 * Maps a documentType string → RegistryEntry. Impls build one with
 * `defineRegistry([Module1, Module2] as const)`; see registry.ts.
 */
export type DocumentRegistry = Record<string, RegistryEntry>;

/**
 * Fallback registry used when a CLI doesn't declare one.
 * Every slot resolves to the base PHDocument / Action shapes.
 * `R = AnyRegistry` is the default for ReactorContext, CoreContext, etc.
 */
export type AnyRegistry = Record<string, RegistryEntry>;

// ── Typed client ──────────────────────────────────────────────────

/**
 * Typed view over IReactorClient. Every method that takes a documentType
 * string, returns a PHDocument, or accepts an Action is re-declared with
 * registry-derived types. All other methods are inherited via `Omit<…>`.
 *
 * Runtime: the underlying object IS an IReactorClient — we only cast at the
 * ReactorContext boundary. No runtime wrapping, no perf cost.
 */
export interface TypedReactorClient<R extends DocumentRegistry> extends Omit<
  IReactorClient,
  | "get"
  | "getOutgoingRelationships"
  | "getIncomingRelationships"
  | "find"
  | "getDocumentModelModule"
  | "create"
  | "createEmpty"
  | "createDocumentInDrive"
  | "execute"
  | "executeAsync"
  | "rename"
  | "addRelationship"
  | "removeRelationship"
  | "moveRelationship"
  | "subscribe"
> {
  get<T extends keyof R & string = keyof R & string>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<R[T]["document"]>;

  getOutgoingRelationships<T extends keyof R & string = keyof R & string>(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<R[T]["document"]>>;

  getIncomingRelationships<T extends keyof R & string = keyof R & string>(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<R[T]["document"]>>;

  find<T extends keyof R & string = keyof R & string>(
    search: Omit<SearchFilter, "documentTypes"> & { documentTypes?: T[] },
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<R[T]["document"]>>;

  getDocumentModelModule<T extends keyof R & string>(
    documentType: T,
  ): Promise<DocumentModelModule<R[T]["state"]>>;

  create<T extends keyof R & string = keyof R & string>(
    document: R[T]["document"],
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<R[T]["document"]>;

  createEmpty<T extends keyof R & string>(
    documentModelType: T,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<R[T]["document"]>;

  createDocumentInDrive<T extends keyof R & string = keyof R & string>(
    driveId: string,
    document: R[T]["document"],
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<R[T]["document"]>;

  execute<T extends keyof R & string = keyof R & string>(
    documentIdentifier: string,
    branch: string,
    actions: Array<R[T]["actions"]>,
    signal?: AbortSignal,
  ): Promise<R[T]["document"]>;

  executeAsync<T extends keyof R & string = keyof R & string>(
    documentIdentifier: string,
    branch: string,
    actions: Array<R[T]["actions"]>,
    signal?: AbortSignal,
  ): Promise<JobInfo>;

  rename<T extends keyof R & string = keyof R & string>(
    documentIdentifier: string,
    name: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<R[T]["document"]>;

  addRelationship<T extends keyof R & string = keyof R & string>(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<R[T]["document"]>;

  removeRelationship<T extends keyof R & string = keyof R & string>(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<R[T]["document"]>;

  moveRelationship<T extends keyof R & string = keyof R & string>(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<{ source: R[T]["document"]; target: R[T]["document"] }>;

  subscribe<T extends keyof R & string = keyof R & string>(
    search: Omit<SearchFilter, "documentTypes"> & { documentTypes?: T[] },
    callback: (event: TypedDocumentChangeEvent<R, T>) => void,
    view?: ViewFilter,
  ): () => void;
}

/** Narrowed DocumentChangeEvent carrying registry-typed documents. */
export interface TypedDocumentChangeEvent<
  R extends DocumentRegistry,
  T extends keyof R & string = keyof R & string,
> extends Omit<DocumentChangeEvent, "documents"> {
  documents: Array<R[T]["document"]>;
}

// ── Drive entry ──────────────────────────────────────────────────

/**
 * A drive managed by the reactor. Each drive has a role:
 * - `personal` — the agent's own workspace drive
 * - `watched` — an observed drive (local or remote)
 */
export interface DriveEntry {
  /** Drive document ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Role: 'personal' = agent's own workspace, 'watched' = observed from elsewhere. */
  role: "personal" | "watched";
}

// ── Folder operations ────────────────────────────────────────────

/**
 * An entry in a drive folder listing — either a folder node or a document node.
 */
export interface FolderEntry {
  /** Document ID of the folder or document node. */
  id: string;
  /** Display name. */
  name: string;
  /** Whether this is a folder node or a document node. */
  type: "folder" | "document";
  /** Document type (only for type: 'document'). */
  documentType?: string;
  /** Full path from drive root, e.g. "specs/my-project". */
  path: string;
}

/**
 * Programmatic API for managing documents in the agent's personal drive
 * using the reactor's native folder hierarchy.
 */
export interface FolderOperations {
  /** Add/link a document to the personal drive at the given folder path. Creates folders as needed. */
  addDocument(
    documentId: string,
    folderPath: string,
    name?: string,
  ): Promise<void>;
  /** Create a new document bound to the personal drive at the given folder path. */
  createDocument(
    documentType: string,
    folderPath: string,
    name?: string,
  ): Promise<{ documentId: string }>;
  /** Remove a document from the personal drive (unlink, not delete the document itself). */
  removeDocument(documentId: string, folderPath?: string): Promise<void>;
  /** Get a document by ID from the personal drive. */
  getDocument(documentId: string): Promise<unknown>;
  /** List contents of a folder in the personal drive. Root when folderPath is omitted. */
  listFolder(folderPath?: string): Promise<FolderEntry[]>;
  /** Ensure a folder path exists, creating intermediate folders as needed. Returns leaf folder ID. */
  ensureFolder(folderPath: string): Promise<string>;
  /** Find documents in the personal drive by document type. */
  findByType(documentType: string): Promise<FolderEntry[]>;
}

// ── Reactor context ───────────────────────────────────────────────

/**
 * Context for the Powerhouse reactor capability.
 * Returned by the reactor factory and accessible via `context.reactor()`.
 */
export interface ReactorContext<R extends DocumentRegistry = AnyRegistry> {
  /** The Reactor client — typed CRUD + subscription API. */
  client: TypedReactorClient<R>;
  /** The default drive ID. Aliases personalDriveId when multi-drive is configured. */
  driveId: string;
  /** All managed drives, ordered as configured. */
  drives?: DriveEntry[];
  /** The personal drive ID (first drive with role 'personal'). */
  personalDriveId?: string;
  /** The switchboard's GraphQL URL (e.g. http://localhost:4001/graphql). */
  switchboardUrl?: string;
  /** The default drive's URL on the switchboard (e.g. http://localhost:4001/d/{driveId}). */
  driveUrl?: string;
  /**
   * Switchboard-provided attachment service. Constructed externally
   * (switchboard owns createRemoteAttachmentService) and passed in via
   * ReactorSetupContext.attachments; a remote attach that is passed none
   * builds one for the switchboard it attached to. Upload and read sites
   * reach it here. Undefined when no attachment service is wired.
   */
  attachments?: IAttachmentService;
  /**
   * Whether the agent may write a document right now (see
   * `createReactorWrites`). Triggers that write on the agent's behalf skip a
   * document this refuses and look again on `powerhouse:writes:ready`.
   */
  writes?: ReactorWrites;
  /** Teardown — called by the framework on CLI exit. */
  shutdown(): Promise<void>;
}

/** See `ReactorContext.writes`. */
export interface ReactorWrites {
  /** The agent's signer can sign as a user. */
  ready(): boolean;
  /** The agent may write this document now (its policy, readiness and the host's rules). */
  canWrite(document: {
    header: {
      id: string;
      documentType?: string;
      protocolVersions?: Record<string, number> | null;
    };
  }): boolean;
}

/**
 * What `ensureDrive` and a `DriveConfig.resolveId` call on a client. Both an
 * `IReactorClient` (in-process or remote) and a Cli's `ReactorContext.client`
 * fit it as they are: the typed client is the same object, and these
 * members read any document as a plain `PHDocument`.
 */
export interface EnsureDriveClient {
  get(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<PHDocument>;
  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;
  newDocument: IReactorClient["newDocument"];
  write: Pick<IReactorClient["write"], "create">;
}

/**
 * Drive configuration for the Powerhouse integration.
 */
export interface DriveConfig {
  /** Drive display name. */
  name: string;
  /** Optional icon URL for the drive. */
  icon?: string;
  /** Deterministic drive ID. When set, the drive is created with this ID
   *  instead of a random UUID. Used for stable cross-session identity. */
  id?: string;
  /** Editor id (from a Connect-loaded package) that Connect should open this
   *  drive in. Stored on `header.meta.preferredEditor` at creation time. Has
   *  no effect on drives that already exist. */
  preferredEditor?: string;
  /**
   * Resolve the drive's id before anything else (for example from a pointer
   * the host keeps for a drive whose id it cannot fix in advance). An id that
   * resolves wins; undefined falls through to `id` and the name match. It
   * gets the client `ensureDrive` was given.
   */
  resolveId?: (client: EnsureDriveClient) => Promise<string | undefined>;
  /** Match an existing drive by name when no id resolves. Default: true. */
  matchByName?: boolean;
  /**
   * Whether the drive may be created now. When this returns false and no
   * drive resolves, none is created: the reactor starts without it (its id
   * is '') and the host creates it later.
   */
  canCreate?: () => boolean;
  /** Called with the id of a drive that was just created. */
  onCreated?: (id: string) => Promise<void> | void;
}

/**
 * Subscription configuration — filters which document changes
 * are bridged to the event bus.
 */
export interface SubscriptionConfig<R extends DocumentRegistry = AnyRegistry> {
  /** Filter by document type(s). */
  documentTypes?: Array<keyof R & string>;
}

/**
 * Context passed to the reactor factory in configureReactor().
 * Provides core infrastructure the factory needs to build the reactor.
 *
 * **Important:** `workspace` must be rooted at `workdir`. In normal framework
 * usage the CLI assembles both from a single workdir value, so they always
 * agree. When constructing this context manually (e.g. in tests or custom
 * reactor factories), ensure `workspace` was created with the same directory
 * as `workdir` — otherwise storage paths (reactor database, config) will
 * land in unexpected locations.
 */
export interface ReactorSetupContext<R extends DocumentRegistry = AnyRegistry> {
  workdir: string;
  config: Record<string, unknown>;
  workspace: WorkdirStore;
  emit?: import("../../core/types.js").EmitFn<R>;
  on?: import("../../core/types.js").OnFn<R>;
  /**
   * Switchboard-provided attachment service to thread through to ReactorContext.
   * The service is constructed externally (switchboard owns createRemoteAttachmentService)
   * and relayed here so the create() factory can place it on the returned context.
   */
  attachments?: IAttachmentService;
  /**
   * Mints the bearer for a switchboard's `/attachments/*` routes, from
   * `CliOptions.attachmentJwtHandler`. A remote attach without `attachments`
   * builds its attachment service with it, else with the remote's
   * `tokenProvider`.
   */
  attachmentJwtHandler?: (url: string) => Promise<string | undefined>;
}

/**
 * Configuration for configureReactor().
 * The `create` factory is called lazily on first reactor() access.
 */
export interface ReactorConfiguration<
  R extends DocumentRegistry = AnyRegistry,
> {
  /**
   * Factory that builds and returns a ReactorContext, when no host runner
   * attaches the CLI to a switchboard (a test fake, a custom client, or an
   * error naming how to run the CLI).
   */
  create: (ctx: ReactorSetupContext<R>) => Promise<ReactorContext<R>>;
  /**
   * What the reactor holds when a host runner attaches it to a remote
   * switchboard instead of calling `create` (see `RunOptions.reactor`):
   * read by `attachDefaultReactor`, never by `create`. A function is called
   * with the setup context at attach time, for what depends on the workdir
   * or the config (an identity, a token).
   */
  remote?: RemoteReactorSource<R>;
}

/** `ReactorConfiguration.remote`: the config, or how to build it at attach. */
export type RemoteReactorSource<R extends DocumentRegistry = AnyRegistry> =
  | RemoteReactorConfig<R>
  | ((
      setup: ReactorSetupContext<R>,
    ) => RemoteReactorConfig<R> | Promise<RemoteReactorConfig<R>>);

/**
 * What a CLI's reactor holds on a remote switchboard: the models its client
 * signs and reduces with, the drives to find or create there, the changes
 * to bridge to the event bus, and who it writes as. No drive: the drive the
 * address names. No signer: writes go out unsigned and the switchboard signs
 * them with its own key.
 */
export interface RemoteReactorConfig<R extends DocumentRegistry = AnyRegistry> {
  /** Any model module fits, as for the reactor and its clients. */
  documentModels?: readonly DocumentModelModule<any>[];
  /** Single drive (sugar for drives: [{ ...drive, role: 'personal' }]). */
  drive?: DriveConfig;
  /** First 'personal' drive = personalDriveId = driveId. */
  drives?: Array<DriveConfig & { role: "personal" | "watched" }>;
  subscriptions?: SubscriptionConfig<R>;
  /**
   * Signs the actions the client pushes, read on every write (see
   * `createReactorWrites`): a signer whose `user` is set later, by a
   * sign-in, takes effect without a new attach.
   *
   * Limit: while the signer has no user, every push is refused with
   * `SignerNotReadyError`, a write to a legacy document included, whatever
   * `legacyDocuments` says. The client asks for its signer before it knows
   * which document it writes, so the resolver cannot pass a legacy write
   * through unsigned. Give a signer only where the documents written are
   * v2, or once its user is known.
   */
  signer?: ISigner;
  /** The bearer per request, for an authenticated switchboard. */
  tokenProvider?: BearerTokenProvider;
  /**
   * Subscribe to changes of the signer's user; returns an unsubscribe
   * function. On each change the realtime socket reconnects with the
   * current bearer, and `powerhouse:writes:ready` is emitted when writes
   * become possible.
   */
  onSignerChange?: (listener: () => void) => () => void;
  /** See `WriteRules.legacyDocuments` (`writes.canWrite`). Default: `sign-when-ready`. */
  legacyDocuments?: "refuse" | "sign-when-ready";
  /** Which documents the agent acts on by itself (`writes.canWrite`). */
  accepts?: (document: {
    header: {
      id: string;
      documentType?: string;
      protocolVersions?: Record<string, number> | null;
    };
  }) => boolean;
}
