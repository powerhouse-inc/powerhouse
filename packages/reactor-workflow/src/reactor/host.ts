// What the engine asks of whatever composes it. Structural on purpose: the
// host that serves the runtime depends on this package, never the other way.
import type {
  IReactorClient,
  ModelManifestEntry,
} from "@powerhousedao/reactor";
import type {
  AuthSubject,
  Principal,
} from "@powerhousedao/shared/document-model";
import type {
  IRelationalDb,
  IWebhookScope,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import type { AttachmentClientLike } from "./attachment-port.js";
import type { SecretStore } from "../pieces/index.js";

// The caller behind a request. The engine only hands it back to the host's own
// access check, so its shape is the host's business.
export type WorkflowCaller = object;

// The signer the host's own reactor client signs with.
export type HostIdentity = { address?: string; key: string };

export interface WorkflowRuntimeHostDeps {
  relationalDb: IRelationalDb;
  reactorClient: IReactorClient;
  // Throws when this caller may not read the document; what it resolves to is
  // the host's own handle, which the engine never reads.
  assertCanRead(identifier: string, caller: WorkflowCaller): Promise<unknown>;
  // The same check for a call that writes the document it names: recording a
  // connection check is a mutation, so reading it is not enough.
  assertCanWrite(identifier: string, caller: WorkflowCaller): Promise<unknown>;
  // Who this caller reads as. Absent, a listing reads as the host and relies
  // on assertCanRead alone to withhold.
  subjectOf?(caller: WorkflowCaller): AuthSubject;
  // REACTOR_AUTH_ENFORCEMENT. On, a workflow with no run user gets no reactor
  // access and writes pass evaluateActions. Absent counts as on.
  authEnforcement?: boolean;
  // Granted execute, beside the run user, on documents a run creates.
  hostPrincipal?: Principal;
  // Who the host signs as. A publish under its key has no run user.
  hostIdentity?: HostIdentity;
  // Importable document models sent to piece workers on fork. Absent, pieces
  // get DocumentModelUnavailableError for every type modelEntries lacks too.
  modelManifest?(): ModelManifestEntry[];
  // A type's importable entries, asked when a worker misses one.
  modelEntries?(documentType: string): ModelManifestEntry[];
  // Absent on a host with no HTTP surface: webhook triggers are then
  // unavailable, which is not the same as having no workflows.
  webhooks?: IWebhookScope;
  // Absent leaves ctx.files inline rather than turning it into an attachment.
  attachments?: AttachmentClientLike;
  // Whether a run of this workflow may read the ref. A step runs with no
  // caller, so the host decides; absent denies.
  canReadAttachmentRef?(documentId: string, ref: string): Promise<boolean>;
  // Defaults to the relational store encrypted with the host's master key.
  secrets?: SecretStore;
  // Where that store generates a key when none is set; false requires one,
  // for a database that outlives the working directory.
  secretsKeyFile?: string | false;
  logger?: ILogger;
  // How long a design-time call waits for a workflow still syncing here.
  syncWaitMs?: number;
  // How long one source's version listing may take before it counts as absent.
  pieceVersionLookupMs?: number;
}
