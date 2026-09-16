// What the engine asks of whatever composes it. Structural on purpose: the
// host that serves the runtime depends on this package, never the other way.
import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  IRelationalDb,
  IWebhookScope,
} from "@powerhousedao/shared/processors";

// The caller behind a request. The engine only hands it back to the host's own
// access check, so its shape is the host's business.
export type WorkflowCaller = object;

export interface WorkflowRuntimeHost {
  relationalDb: IRelationalDb;
  reactorClient: IReactorClient;
  // Throws when this caller may not read the document; what it resolves to is
  // the host's own handle, which the engine never reads.
  assertCanRead(identifier: string, caller: WorkflowCaller): Promise<unknown>;
  // Absent on a host with no HTTP surface: webhook triggers are then
  // unavailable, which is not the same as having no workflows.
  http?: { webhooks?: IWebhookScope };
}
