// A runtime over the shared test database, with the host surface a suite needs
// and inert stand-ins for the rest.
import type { IReactorClient } from "@powerhousedao/reactor";
import type { WorkflowRuntimeHostDeps } from "../../src/reactor/host.js";
import { WorkflowRuntimeService } from "../../src/reactor/service.js";
import { createTestRelationalDb } from "./pglite.js";
import { trackRuntime } from "./started-runtimes.js";

// Seeding runs from the constructor, so a suite that never publishes a
// workflow still needs a client that answers the sweep.
const findNothing = () => Promise.resolve({ results: [] });

const emptyClient = {
  find: findNothing,
  get: () => Promise.reject(new Error("No reactor client in this suite")),
} as unknown as IReactorClient;

// A client that cannot answer the sweep sends seeding through its retries,
// which log for most of a second after the test that started them is over.
function withSweep(client: IReactorClient): IReactorClient {
  if (typeof client.find === "function") return client;
  return Object.assign(Object.create(client) as IReactorClient, {
    find: findNothing,
  });
}

export function testRuntime(
  deps: Partial<WorkflowRuntimeHostDeps> = {},
): WorkflowRuntimeService {
  const service = new WorkflowRuntimeService({
    relationalDb: createTestRelationalDb(),
    assertCanRead: () => Promise.resolve(undefined),
    assertCanWrite: () => Promise.resolve(undefined),
    ...deps,
    reactorClient: withSweep(deps.reactorClient ?? emptyClient),
  });
  trackRuntime(service);
  return service;
}
