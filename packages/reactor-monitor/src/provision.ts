import { provisionInProcess } from "./in-process.js";
import { provisionRemote } from "./remote/provision.js";
import type { ManagedReactor, ReactorDescriptor } from "./types.js";
import {
  provisionWorkerReactor,
  type ProvisionWorkerOptions,
} from "./worker/client.js";

export type ProvisionOptions = ProvisionWorkerOptions;

/**
 * Provisions a reactor matching `descriptor` and returns the handle the
 * monitor drives it through.
 *
 * `worker` hosts the reactor in a SharedWorker named after the descriptor and
 * reaches it over RPC; `in-process` builds it on the calling thread. Both
 * namespace their store by `descriptor.name`, so provisioning N descriptors
 * gives N independent reactors in one origin.
 *
 * `remote` attaches an already-running reactor (a Switchboard) over HTTP: it
 * builds nothing and namespaces nothing, and its inspection surfaces speak to
 * reactor-api's inspection subgraph (multi-reactor W3.2). `descriptor.name`
 * is then only this monitor session's label for it.
 */
export function provision(
  descriptor: ReactorDescriptor,
  options: ProvisionOptions = {},
): Promise<ManagedReactor> {
  switch (descriptor.kind) {
    case "in-process":
      return provisionInProcess(descriptor);
    case "worker":
      try {
        return Promise.resolve(provisionWorkerReactor(descriptor, options));
      } catch (error) {
        return Promise.reject(error as Error);
      }
    case "remote":
      return provisionRemote(descriptor);
    default: {
      const kind: never = descriptor.kind;
      return Promise.reject(
        new Error(`Unknown reactor kind: ${JSON.stringify(kind)}`),
      );
    }
  }
}
