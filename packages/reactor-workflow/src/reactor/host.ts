// What the engine asks of whatever composes it. Structural on purpose: the
// host that serves the runtime depends on this package, never the other way.
import type { IReactorClient } from "@powerhousedao/reactor";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
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
  // Absent on a host with no HTTP surface: webhook triggers are then
  // unavailable, which is not the same as having no workflows.
  webhooks?: IWebhookScope;
  // Absent leaves ctx.files inline rather than turning it into an attachment.
  attachments?: AttachmentClientLike;
  // Whether this document is the one that vouches for the ref. A step runs
  // with no caller, so the relationship is the whole check; absent denies.
  canReadAttachmentRef?(documentId: string, ref: string): Promise<boolean>;
  // Defaults to the relational store encrypted with the host's master key.
  secrets?: SecretStore;
  logger?: ILogger;
}
