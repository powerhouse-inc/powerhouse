// A runtime over the shared test database, with the host surface a suite needs
// and inert stand-ins for the rest.
import type { IReactorClient } from "@powerhousedao/reactor";
import type { WorkflowRuntimeHostDeps } from "../../src/reactor/host.js";
import { WorkflowRuntimeService } from "../../src/reactor/service.js";
import { createTestRelationalDb } from "./pglite.js";

// Seeding runs from the constructor, so a suite that never publishes a
// workflow still needs a client that answers the sweep.
const emptyClient = {
  find: () => Promise.resolve({ results: [] }),
  get: () => Promise.reject(new Error("No reactor client in this suite")),
} as unknown as IReactorClient;

export function testRuntime(
  deps: Partial<WorkflowRuntimeHostDeps> = {},
): WorkflowRuntimeService {
  return new WorkflowRuntimeService({
    relationalDb: createTestRelationalDb(),
    reactorClient: emptyClient,
    assertCanRead: () => Promise.resolve(undefined),
    ...deps,
  });
}
