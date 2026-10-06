// An in-process reactor holding connection and workflow documents, for the
// suites that read a connection's state back rather than a client's calls.
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type IReactorClient,
  type PagingOptions,
  type SearchFilter,
  type ViewFilter,
} from "@powerhousedao/reactor";
import {
  initializeAuth,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { Connection } from "@powerhousedao/workflow/document-models/connection";
import { Workflow } from "@powerhousedao/workflow/document-models/workflow";
import type { Action } from "document-model";

export async function connectionReactor(
  options: { authEnforcement?: boolean } = {},
): Promise<InProcessReactorClientModule> {
  const builder = new ReactorBuilder().withDocumentModelSources([
    Connection as unknown as DocumentModelModule,
    Workflow as unknown as DocumentModelModule,
  ]);
  if (options.authEnforcement) {
    builder.withExecutorConfig({
      featureFlags: { documentDecisions: true, authEnforcement: true },
    });
  }
  return new ReactorClientBuilder().withReactorBuilder(builder).buildModule();
}

// The client a host hands the runtime: its unscoped reads are the host's own.
export function readingAs(
  client: IReactorClient,
  address: string,
): IReactorClient {
  const subject = { address };
  const scoped = (view?: ViewFilter) => ({
    ...view,
    subject: view?.subject ?? subject,
  });
  return Object.assign(Object.create(client) as IReactorClient, {
    get: (id: string, view?: ViewFilter) => client.get(id, scoped(view)),
    find: (search: SearchFilter, view?: ViewFilter, paging?: PagingOptions) =>
      client.find(search, scoped(view), paging),
  });
}

// Creates a `kind` document with `id`, then applies `list`. With `readers`,
// only they (and no one anonymous) may read its global scope.
export async function createDocument(
  module: InProcessReactorClientModule,
  kind: "connection" | "workflow",
  id: string,
  list: Action[],
  readers?: string[],
): Promise<void> {
  const model = kind === "connection" ? Connection : Workflow;
  const { client } = module;
  await client.create(
    withSignaturePolicy(model.utils.createDocument(), "legacy", { id }),
  );
  if (list.length > 0) await client.execute(id, "main", list);
  if (readers) {
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          ...readers.map((address, index) => ({
            id: `g-read-${index}`,
            description: "reads the domain",
            effect: "allow" as const,
            principal: { address },
            capability: { can: "read" as const, scope: "global" },
          })),
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow" as const,
            principal: { anyone: true as const },
            capability: { can: "execute" as const, scope: "auth" },
          },
        ],
      }),
    ]);
  }
}

// The host's read gate, answered by the reactor as the caller.
export function reactorReadGate(module: InProcessReactorClientModule) {
  return async (id: string, caller: object) => {
    const address = (caller as { user?: { address?: string } }).user?.address;
    const served = await module.client
      .isServed(id, { subject: { address } })
      .catch(() => false);
    if (!served) throw new Error("forbidden");
  };
}
